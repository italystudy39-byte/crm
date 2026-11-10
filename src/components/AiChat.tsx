"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Part =
  | { kind: "tool"; label: string }
  | { kind: "ticket"; id: string }
  | { kind: "task"; title: string };
type Msg = { role: "user" | "assistant"; content: string; parts?: Part[]; error?: boolean };

export type AskAiDetail = { prompt: string; dealId?: string; dealTitle?: string };
export const ASK_AI_EVENT = "crm:ask-ai";

/** Open the chat widget with a prefilled question (used by contextual buttons). */
export function askAi(detail: AskAiDetail) {
  window.dispatchEvent(new CustomEvent<AskAiDetail>(ASK_AI_EVENT, { detail }));
}

const SUGGESTIONS = ["Как импортировать контакты из CSV?", "Сколько сделок на каждом этапе?", "Как пригласить сотрудника?"];

// Minimal, safe markdown: **bold**, `code`, "- " lists, paragraphs.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((t, i) =>
    t.startsWith("**") && t.endsWith("**") && t.length > 4 ? <strong key={i}>{t.slice(2, -2)}</strong>
    : t.startsWith("`") && t.endsWith("`") && t.length > 2 ? <code key={i} className="rounded bg-slate-200/60 px-1 text-[0.85em]">{t.slice(1, -1)}</code>
    : <Fragment key={i}>{t}</Fragment>,
  );
}
function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>);
          return ordered ? <ol key={i} className="ml-4 list-decimal space-y-0.5">{items}</ol> : <ul key={i} className="ml-4 list-disc space-y-0.5">{items}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ""))}</Fragment>)}</p>;
      })}
    </>
  );
}

export function AiChat({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [deal, setDeal] = useState<{ id: string; title?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const update = (fn: (m: Msg) => Msg) =>
    setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  const send = useCallback(
    async (text: string, dealId?: string | null) => {
      const q = text.trim();
      if (!q || abort.current) return;
      const history: Msg[] = [...msgs, { role: "user", content: q }];
      setMsgs([...history, { role: "assistant", content: "", parts: [] }]);
      setInput("");
      setBusy(true);
      const ac = new AbortController();
      abort.current = ac;
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ac.signal,
          body: JSON.stringify({
            slug,
            dealId: dealId ?? undefined,
            // only completed text turns go back to the server
            messages: history.filter((m) => !m.error && m.content.trim()).slice(-20).map(({ role, content }) => ({ role, content })),
          }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          update((m) => ({ ...m, content: j.error ?? "Не удалось получить ответ.", error: true }));
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.text }));
            else if (ev.type === "break") update((m) => ({ ...m, content: m.content && !m.content.endsWith("\n\n") ? m.content + "\n\n" : m.content }));
            else if (ev.type === "tool") update((m) => ({ ...m, parts: [...(m.parts ?? []), { kind: "tool", label: ev.label }] }));
            else if (ev.type === "ticket") update((m) => ({ ...m, parts: [...(m.parts ?? []), { kind: "ticket", id: ev.id }] }));
            else if (ev.type === "task") update((m) => ({ ...m, parts: [...(m.parts ?? []), { kind: "task", title: ev.title }] }));
            else if (ev.type === "error") update((m) => ({ ...m, content: (m.content ? m.content + "\n\n" : "") + ev.message, error: !m.content }));
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") update((m) => ({ ...m, content: m.content || "Ошибка сети, попробуйте ещё раз.", error: !m.content }));
      } finally {
        abort.current = null;
        setBusy(false);
        update((m) => (m.role === "assistant" && !m.content.trim() && !m.error ? { ...m, content: "Ответ прерван.", error: true } : m));
        inputRef.current?.focus();
      }
    },
    [msgs, slug],
  );

  // contextual "Спросить AI" buttons
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<AskAiDetail>).detail;
      setOpen(true);
      if (d.dealId) setDeal({ id: d.dealId, title: d.dealTitle });
      sendRef.current(d.prompt, d.dealId ?? null);
    };
    window.addEventListener(ASK_AI_EVENT, onAsk);
    return () => window.removeEventListener(ASK_AI_EVENT, onAsk);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const reset = () => {
    abort.current?.abort();
    setMsgs([]);
    setDeal(null);
  };

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="AI-ассистент"
          className="fixed inset-x-2 bottom-20 top-16 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[min(600px,calc(100vh-7rem))] sm:w-[400px]"
        >
          <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white"><Sparkle /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">AI-ассистент</div>
              <div className="truncate text-xs text-slate-500">Ответы по CRM, сделки, задачи</div>
            </div>
            {msgs.length > 0 && <button onClick={reset} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Новый диалог</button>}
            <button onClick={() => setOpen(false)} aria-label="Закрыть" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">✕</button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-3 pt-4 text-center">
                <p className="text-slate-500">Спросите, как что-то сделать в CRM, попросите сводку по сделкам или создать задачу.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s, deal?.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-white">{m.content}</div>
              ) : (
                <div key={i} className="mr-6 space-y-2">
                  {(m.parts ?? []).filter((p): boolean => p.kind === "tool").map((p, j) =>
                    p.kind === "tool" ? (
                      <div key={j} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className={busy && i === msgs.length - 1 && !m.content ? "animate-pulse" : ""}>●</span>{p.label}
                      </div>
                    ) : p.kind === "ticket" ? (
                      <Link key={j} href={`/o/${slug}/support`} className="block rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        🎫 Тикет создан. Статус — в разделе «Поддержка» →
                      </Link>
                    ) : (
                      <Link key={j} href={`/o/${slug}/tasks`} className="block rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 hover:bg-green-100">
                        ✓ Задача «{p.title}» создана →
                      </Link>
                    ),
                  )}
                  {m.content ? (
                    <div className={`space-y-2 rounded-2xl rounded-bl-md px-3 py-2 leading-relaxed ${m.error ? "bg-red-50 text-red-700" : "bg-slate-100"}`}>
                      <Markdown text={m.content} />
                    </div>
                  ) : (
                    busy && i === msgs.length - 1 && <div className="flex gap-1 px-3 py-2"><Dot d="0ms" /><Dot d="150ms" /><Dot d="300ms" /></div>
                  )}
                  {(m.parts ?? []).filter((p): boolean => p.kind !== "tool").map((p, j) =>
                    p.kind === "tool" ? (
                      <div key={j} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className={busy && i === msgs.length - 1 && !m.content ? "animate-pulse" : ""}>●</span>{p.label}
                      </div>
                    ) : p.kind === "ticket" ? (
                      <Link key={j} href={`/o/${slug}/support`} className="block rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                        🎫 Тикет создан. Статус — в разделе «Поддержка» →
                      </Link>
                    ) : (
                      <Link key={j} href={`/o/${slug}/tasks`} className="block rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800 hover:bg-green-100">
                        ✓ Задача «{p.title}» создана →
                      </Link>
                    ),
                  )}
                </div>
              ),
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input, deal?.id);
            }}
            className="border-t border-slate-100 p-3"
          >
            {deal && (
              <div className="mb-2 flex items-center gap-1 text-xs text-slate-500">
                <span className="truncate rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">Контекст: {deal.title ?? "сделка"}</span>
                <button type="button" onClick={() => setDeal(null)} className="px-1 hover:text-red-600" aria-label="Убрать контекст">✕</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input, deal?.id);
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Напишите вопрос…"
                className="input max-h-32 min-h-[40px] flex-1 resize-none"
              />
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} className="btn-ghost h-10" aria-label="Остановить">■</button>
              ) : (
                <button className="btn h-10" disabled={!input.trim()} aria-label="Отправить">↑</button>
              )}
            </div>
          </form>
        </section>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Закрыть AI-ассистента" : "Открыть AI-ассистента"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:scale-105 hover:bg-indigo-700"
      >
        {open ? <span className="text-xl">✕</span> : <Sparkle size={24} />}
      </button>
    </>
  );
}

function Dot({ d }: { d: string }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: d }} />;
}

export function Sparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
      <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity=".7" />
    </svg>
  );
}
