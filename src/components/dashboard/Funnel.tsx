type Step = { id: string; name: string; color: string; count: number; amount: number };

export function Funnel({ steps, lost, currency }: { steps: Step[]; lost: number; currency: string }) {
  const top = steps[0]?.count ?? 0;
  const fmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 });
  if (top === 0) return <p className="py-8 text-center text-sm text-slate-400">За период новых сделок нет</p>;

  // Find the largest relative drop between consecutive steps.
  let worst = -1, worstRate = 1;
  steps.forEach((s, i) => {
    if (i === 0 || !steps[i - 1].count) return;
    const r = s.count / steps[i - 1].count;
    if (r < worstRate) { worstRate = r; worst = i; }
  });

  return (
    <div className="space-y-1">
      {steps.map((s, i) => {
        const w = Math.max(4, (s.count / top) * 100);
        const fromPrev = i > 0 && steps[i - 1].count ? Math.round((s.count / steps[i - 1].count) * 100) : null;
        return (
          <div key={s.id}>
            {fromPrev !== null && (
              <div className={`pl-1 text-[11px] ${i === worst && worstRate < 1 ? "font-medium text-red-600" : "text-slate-400"}`}>
                ↓ {fromPrev}% {i === worst && worstRate < 1 ? "· самый большой отвал" : ""}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-sm">{s.name}</div>
              <div className="relative h-7 flex-1">
                <div className="mx-auto flex h-7 items-center justify-center rounded text-xs font-medium text-white" style={{ width: `${w}%`, background: s.color }}>
                  {s.count}
                </div>
              </div>
              <div className="w-24 shrink-0 text-right text-xs text-slate-500">{fmt.format(s.amount)}</div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
        <span>Конверсия в успех: <b className="text-slate-700">{Math.round(((steps.at(-1)?.count ?? 0) / top) * 100)}%</b></span>
        <span>Отказов: {lost}</span>
      </div>
    </div>
  );
}
