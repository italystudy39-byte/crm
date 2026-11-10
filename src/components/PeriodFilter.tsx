"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/period";

export function PeriodFilter({ current, fromYmd, toYmd, label }: { current: PeriodKey; fromYmd: string; toYmd: string; label: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const href = (k: PeriodKey) => {
    const q = new URLSearchParams(sp.toString());
    q.set("period", k);
    q.delete("from"); q.delete("to");
    return `${path}?${q}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).filter((k) => k !== "custom").map((k) => (
          <Link key={k} href={href(k)} className={`rounded-md px-3 py-1 text-sm ${current === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {PERIOD_LABELS[k]}
          </Link>
        ))}
      </div>
      <details className="relative" open={current === "custom" ? undefined : undefined}>
        <summary className={`cursor-pointer list-none rounded-lg border px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden ${current === "custom" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}>
          {current === "custom" ? label : "Свой диапазон"}
        </summary>
        <form method="get" action={path} className="absolute right-0 z-20 mt-1 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg sm:flex-row sm:items-end">
          <input type="hidden" name="period" value="custom" />
          {sp.get("p") && <input type="hidden" name="p" value={sp.get("p")!} />}
          <div><label className="label">С</label><input type="date" name="from" defaultValue={fromYmd} className="input" /></div>
          <div><label className="label">По</label><input type="date" name="to" defaultValue={toYmd} className="input" /></div>
          <button className="btn">Показать</button>
        </form>
      </details>
    </div>
  );
}
