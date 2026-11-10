import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type Part } from "@google/genai";
import { TOOLS, TOOL_LABELS, runTool, type AgentCtx } from "./tools";

export type Send = (o: unknown) => void;
export type RunArgs = {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  ctx: AgentCtx;
  send: Send;
  signal: AbortSignal;
};

const MAX_STEPS = 6;

/** Which AI provider is configured: Groq, then Claude, then Gemini. */
export function activeProvider(): "groq" | "gemini" | "claude" | null {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

// Haiku 5.5 is the low-cost default; set ANTHROPIC_MODEL=claude-opus-5-5 for the strongest model.
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

async function execTool(name: string, input: unknown, ctx: AgentCtx, send: Send) {
  send({ type: "tool", name, label: TOOL_LABELS[name] ?? name });
  const r = await runTool(name, input, ctx);
  if (r.event) send(r.event);
  return r;
}

// ---------------- Gemini ----------------
const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
].filter((m, i, a): m is string => !!m && a.indexOf(m) === i);

// Overloaded / rate-limited / unknown model: try the next model in the chain.
class FirstTokenTimeout extends Error {
  name = "FirstTokenTimeout";
}
const retryable = (e: unknown) =>
  (e instanceof ApiError && [404, 429, 500, 503].includes(e.status)) || e instanceof FirstTokenTimeout;
const FIRST_TOKEN_MS = 20_000;

export async function runGemini({ system, messages, ctx, send, signal }: RunArgs) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { retryOptions: { attempts: 1 } } });
  const contents: Content[] = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const functionDeclarations = TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }));
  let modelIdx = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const modelParts: Part[] = [];
    let finish: string | undefined;
    for (;;) {
      const model = GEMINI_MODELS[modelIdx];
      let streamed = false;
      const t0 = Date.now();
      // Abort if the model has not started answering in time (overloaded free tier can hang).
      const ac = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, FIRST_TOKEN_MS);
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: system,
            tools: [{ functionDeclarations }],
            ...(model.startsWith("gemini-2") ? {} : { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
            abortSignal: AbortSignal.any([signal, ac.signal]),
          },
        });
        // Keep every part the model returned (incl. thought signatures) to send back as history.
        for await (const chunk of stream) {
          clearTimeout(timer);
          const cand = chunk.candidates?.[0];
          if (cand?.finishReason) finish = cand.finishReason;
          for (const p of cand?.content?.parts ?? []) {
            modelParts.push(p);
            if (p.text && !p.thought) {
              streamed = true;
              send({ type: "text", text: p.text });
            }
          }
        }
        clearTimeout(timer);
        console.info("gemini ok", model, `${Date.now() - t0}ms`);
        break;
      } catch (err) {
        clearTimeout(timer);
        const e = timedOut && !signal.aborted ? new FirstTokenTimeout(`no answer from ${model} in ${FIRST_TOKEN_MS}ms`) : err;
        console.warn("gemini attempt failed", model, `${Date.now() - t0}ms`, e instanceof ApiError ? `${e.status} ${e.message.slice(0, 300)}` : (e as Error).message);
        if (signal.aborted || streamed || !retryable(e) || modelIdx >= GEMINI_MODELS.length - 1) throw e;
        modelIdx++;
        modelParts.length = 0;
        finish = undefined;
      }
    }
    const calls = modelParts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
      send({ type: "text", text: "\n\nНе могу помочь с этим запросом." });
      return;
    }
    if (!calls.length) return;

    contents.push({ role: "model", parts: modelParts });
    const responses: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const r = await execTool(name, call.args ?? {}, ctx, send);
      responses.push({ functionResponse: { id: call.id, name, response: r.isError ? { error: r.content } : { output: r.content } } });
    }
    contents.push({ role: "user", parts: responses });
    send({ type: "break" });
  }
}

export function geminiErrorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Превышен лимит бесплатных запросов к Gemini, попробуйте через минуту.";
    if (e.status === 503) return "Gemini сейчас перегружен, попробуйте через минуту.";
    if (e.status === 400 || e.status === 401 || e.status === 403) return "Проблема с ключом GEMINI_API_KEY или моделью.";
    return "AI-сервис временно недоступен, попробуйте ещё раз.";
  }
  if (e instanceof FirstTokenTimeout) return "Gemini сейчас не отвечает (бесплатный тариф перегружен), попробуйте через минуту.";
  return null;
}

// ---------------- Claude ----------------
export async function runClaude({ system, messages, ctx, send, signal }: RunArgs) {
  const client = new Anthropic();
  const history: Anthropic.Beta.BetaMessageParam[] = messages.map((x) => ({ role: x.role, content: x.content }));
  for (let step = 0; step < MAX_STEPS; step++) {
    const s = client.beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        system,
        messages: history,
        tools: TOOLS,
        output_config: { effort: "low" },
        // Server-side fallback is not available on Haiku; use it on the larger models.
        ...(CLAUDE_MODEL.startsWith("claude-haiku") ? {} : { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] }),
      },
      { signal },
    );
    s.on("text", (t) => send({ type: "text", text: t }));
    const msg = await s.finalMessage();

    if (msg.stop_reason === "refusal") {
      send({ type: "text", text: "\n\nНе могу помочь с этим запросом." });
      return;
    }
    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "max_tokens" && toolUses.length) {
      send({ type: "text", text: "\n\nОтвет получился слишком длинным, попробуйте уточнить вопрос." });
      return;
    }
    if (msg.stop_reason !== "tool_use" || !toolUses.length) return;

    history.push({ role: "assistant", content: msg.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const r = await execTool(tu.name, tu.input, ctx, send);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    history.push({ role: "user", content: results });
    send({ type: "break" });
  }
}

export function claudeErrorMessage(e: unknown) {
  if (e instanceof Anthropic.RateLimitError) return "Слишком много запросов, попробуйте через минуту.";
  if (e instanceof Anthropic.AuthenticationError) return "Неверный ключ ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.APIError) return "AI-сервис временно недоступен, попробуйте ещё раз.";
  return null;
}

// ---------------- Groq (OpenAI-compatible) ----------------
const GROQ_MODELS = [process.env.GROQ_MODEL, "openai/gpt-oss-120b", "llama-3.3-70b-versatile"].filter(
  (m, i, a): m is string => !!m && a.indexOf(m) === i,
);

/** If none of our preferred models exist any more, pick a tool-capable one from the live list. */
async function discoverGroqModel(client: OpenAI) {
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id);
  console.info("groq models available", ids.join(", "));
  const prefs = [/gpt-oss-120b/, /llama.*70b/, /qwen/, /gpt-oss/, /llama/];
  for (const re of prefs) {
    const hit = ids.find((id) => re.test(id) && !/guard|whisper|tts|vision/.test(id));
    if (hit) return hit;
  }
  return null;
}

export async function runGroq({ system, messages, ctx, send, signal }: RunArgs) {
  const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1", maxRetries: 1, timeout: 60_000 });
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
  const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const models = [...GROQ_MODELS];
  let modelIdx = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    let text = "";
    const calls: { id: string; name: string; args: string }[] = [];
    let finish: string | null = null;
    for (;;) {
      const model = models[modelIdx];
      let streamed = false;
      try {
        const stream = await client.chat.completions.create(
          { model, messages: history, tools, tool_choice: "auto", stream: true, temperature: 0.3, max_completion_tokens: 4000 },
          { signal },
        );
        for await (const chunk of stream) {
          const ch = chunk.choices[0];
          if (!ch) continue;
          if (ch.finish_reason) finish = ch.finish_reason;
          if (ch.delta?.content) {
            streamed = true;
            text += ch.delta.content;
            send({ type: "text", text: ch.delta.content });
          }
          for (const tc of ch.delta?.tool_calls ?? []) {
            const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
            if (tc.id) c.id = tc.id;
            if (tc.function?.name) c.name += tc.function.name;
            if (tc.function?.arguments) c.args += tc.function.arguments;
          }
        }
        break;
      } catch (e) {
        const status = e instanceof OpenAI.APIError ? e.status : undefined;
        console.warn("groq attempt failed", model, status, (e as Error).message.slice(0, 300));
        if (signal.aborted || streamed) throw e;
        if (status === 404 || (status === 400 && /model/i.test((e as Error).message))) {
          if (modelIdx < models.length - 1) {
            modelIdx++;
            continue;
          }
          const found = await discoverGroqModel(client).catch(() => null);
          if (found && !models.includes(found)) {
            models.push(found);
            modelIdx = models.length - 1;
            continue;
          }
        }
        throw e;
      }
    }
    const toolCalls = calls.filter(Boolean);
    if (!toolCalls.length) return;
    if (finish === "length") {
      send({ type: "text", text: "\n\nОтвет получился слишком длинным, попробуйте уточнить вопрос." });
      return;
    }

    history.push({
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })),
    });
    for (const c of toolCalls) {
      let input: unknown;
      try {
        input = c.args ? JSON.parse(c.args) : {};
      } catch {
        history.push({ role: "tool", tool_call_id: c.id, content: "Ошибка: аргументы не являются корректным JSON" });
        continue;
      }
      const r = await execTool(c.name, input, ctx, send);
      history.push({ role: "tool", tool_call_id: c.id, content: r.isError ? `Ошибка: ${r.content}` : r.content });
    }
    send({ type: "break" });
  }
}

export function groqErrorMessage(e: unknown) {
  if (e instanceof OpenAI.APIError) {
    if (e.status === 429) return "Превышен бесплатный лимит Groq, попробуйте через минуту.";
    if (e.status === 401 || e.status === 403) return "Проблема с ключом GROQ_API_KEY.";
    return "AI-сервис временно недоступен, попробуйте ещё раз.";
  }
  return null;
}
