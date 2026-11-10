type Point = { label: string; value: number; count: number };

/** Bar chart of won revenue per bucket, drawn as inline SVG. */
export function RevenueChart({ points, currency, bucket }: { points: Point[]; currency: string; bucket: "day" | "week" }) {
  const W = 640, H = 200, padL = 48, padB = 24, padT = 12;
  const max = Math.max(...points.map((p) => p.value), 0);
  const niceMax = niceCeil(max || 1);
  const n = Math.max(points.length, 1);
  const bw = (W - padL) / n;
  const barW = Math.max(2, Math.min(28, bw * 0.7));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
  const full = new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 });
  const labelEvery = Math.ceil(n / 8);
  const ticks = [0, 0.5, 1].map((f) => niceMax * f);

  if (max === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">За период нет выигранных сделок</div>;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Выигранные сделки по ${bucket === "day" ? "дням" : "неделям"}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-slate-200" strokeDasharray={t === 0 ? undefined : "3 3"} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{compact.format(t)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = padL + bw * i + bw / 2;
        const top = y(p.value);
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(0, y(0) - top)} rx={2} className="fill-green-500 hover:fill-green-600">
              <title>{`${p.label}: ${full.format(p.value)} · сделок: ${p.count}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">{p.label.replace(".", "")}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function niceCeil(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
