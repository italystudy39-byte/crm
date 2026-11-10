import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, type Content, type Part } from "@google/genai";
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

/** Which AI provider is configured. Gemini wins when both keys are set. */
export function activeProvider(): "gemini" | "claude" | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

async function execTool(name: string, input: unknown, ctx: AgentCtx, send: Send) {
  send({ type: "tool", name, label: TOOL_LABELS[name] ?? name });
  const r = await runTool(name, input, ctx);
  if (r.event) send(r.event);
  return r;
}

// ---------------- Gemini ----------------
export async function runGemini({ system, messages, ctx, send, signal }: RunArgs) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const contents: Content[] = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const functionDeclarations = TOOLS.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: system, tools: [{ functionDeclarations }], abortSignal: signal },
    });
    // Keep every part the model returned (incl. thought signatures) to send back as history.
    const modelParts: Part[] = [];
    let finish: string | undefined;
    for await (const chunk of stream) {
      const cand = chunk.candidates?.[0];
      if (cand?.finishReason) finish = cand.finishReason;
      for (const p of cand?.content?.parts ?? []) {
        modelParts.push(p);
        if (p.text && !p.thought) send({ type: "text", text: p.text });
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
    if (e.status === 429) return "Превышен лимит запросов к Gemini, попробуйте через минуту.";
    if (e.status === 400 || e.status === 401 || e.status === 403) return "Проблема с ключом GEMINI_API_KEY или моделью.";
    return "AI-сервис временно недоступен, попробуйте ещё раз.";
  }
  return null;
}

// ---------------- Claude ----------------
export async function runClaude({ system, messages, ctx, send, signal }: RunArgs) {
  const client = new Anthropic();
  const history: Anthropic.Beta.BetaMessageParam[] = messages.map((x) => ({ role: x.role, content: x.content }));
  for (let step = 0; step < MAX_STEPS; step++) {
    const s = client.beta.messages.stream(
      {
        model: "claude-opus-5-5",
        max_tokens: 8000,
        system,
        messages: history,
        tools: TOOLS,
        output_config: { effort: "low" },
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
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
