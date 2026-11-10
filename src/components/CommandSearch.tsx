"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchHit } from "@/app/o/[slug]/search-actions";

const noop = () => () => {};

const KIND_LABEL = { deal: "Сделка", contact: "Контакт", company: "Компания" } as const;

export function CommandSearch({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isMac = useSyncExternalStore(noop, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setHits([]); return; }
      start(async () => { setHits(await globalSearch(slug, q)); setActive(0); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, slug]);

  function go(h: SearchHit) { setOpen(false); setQ(""); router.push(h.href); }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full max-w-xs items-center gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-500 hover:border-slate-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="flex-1 text-left">Поиск</span>
        <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 text-xs sm:inline">{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Сделки, контакты, компании…"
              className="w-full border-b border-slate-200 px-4 py-3 text-base outline-none"
            />
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {q.trim().length < 2 && <p className="p-3 text-sm text-slate-500">Введите минимум 2 символа</p>}
              {q.trim().length >= 2 && !pending && hits.length === 0 && <p className="p-3 text-sm text-slate-500">Ничего не найдено</p>}
              {hits.map((h, i) => (
                <button
                  key={h.kind + h.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-indigo-50" : ""}`}
                >
                  <span className="w-16 shrink-0 text-xs text-slate-400">{KIND_LABEL[h.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.subtitle && <span className="block truncate text-xs text-slate-500">{h.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
