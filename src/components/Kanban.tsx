"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { moveDeal } from "@/app/o/[slug]/actions";

type Stage = { id: string; name: string; color: string; kind: string };
type Deal = { id: string; title: string; amount: number; stage_id: string; contact: string | null };

export function Kanban({ slug, stages, deals, currency, canEdit }: { slug: string; stages: Stage[]; deals: Deal[]; currency: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [items, move] = useOptimistic(deals, (state, { id, stageId }: { id: string; stageId: string }) =>
    state.map((d) => (d.id === id ? { ...d, stage_id: stageId } : d)),
  );
  const fmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 });

  function drop(stageId: string, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    start(async () => {
      move({ id, stageId });
      await moveDeal(slug, id, stageId);
    });
  }

  return (
    <div className={`flex gap-3 overflow-x-auto pb-4 ${pending ? "opacity-80" : ""}`}>
      {stages.map((s) => {
        const col = items.filter((d) => d.stage_id === s.id);
        const sum = col.reduce((a, d) => a + Number(d.amount), 0);
        return (
          <div
            key={s.id}
            onDragOver={(e) => canEdit && e.preventDefault()}
            onDrop={(e) => canEdit && drop(s.id, e)}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2"
          >
            <div className="mb-2 border-t-4 px-1 pt-2" style={{ borderColor: s.color }}>
              <div className="flex justify-between text-sm font-medium"><span>{s.name}</span><span className="text-slate-500">{col.length}</span></div>
              <div className="text-xs text-slate-500">{fmt.format(sum)}</div>
            </div>
            <div className="flex min-h-24 flex-col gap-2">
              {col.map((d) => (
                <div
                  key={d.id}
                  draggable={canEdit}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-surface p-3 shadow-sm active:cursor-grabbing"
                >
                  <Link href={`/o/${slug}/deals/${d.id}`} className="font-medium hover:text-indigo-600">{d.title}</Link>
                  <div className="text-sm text-slate-600">{fmt.format(Number(d.amount))}</div>
                  {d.contact && <div className="text-xs text-slate-400">{d.contact}</div>}
                  {canEdit && (
                    <select
                      aria-label="Этап"
                      className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs md:hidden"
                      value={d.stage_id}
                      onChange={(e) => {
                        const stageId = e.target.value;
                        start(async () => { move({ id: d.id, stageId }); await moveDeal(slug, d.id, stageId); });
                      }}
                    >
                      {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
