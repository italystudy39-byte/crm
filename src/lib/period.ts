export type PeriodKey = "today" | "week" | "month" | "quarter" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  custom: "Свой диапазон",
};

/** Minutes the zone is ahead of UTC at the given instant. */
function tzOffsetMs(tz: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local calendar date (y, m, d) of an instant in a zone. */
export function localYmd(tz: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day };
}

/** UTC instant of local midnight for a calendar date in a zone. */
export function zonedMidnight(tz: string, y: number, m: number, d: number) {
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMs(tz, guess));
}

export function ymdKey(tz: string, at: Date) {
  const { y, m, d } = localYmd(tz, at);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseYmd(s: string | undefined) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export type Period = { key: PeriodKey; from: Date; to: Date; label: string; fromYmd: string; toYmd: string; bucket: "day" | "week" };

export function resolvePeriod(tz: string, sp: Record<string, string | string[] | undefined>, now = new Date()): Period {
  const raw = typeof sp.period === "string" ? sp.period : "month";
  const key: PeriodKey = (raw in PERIOD_LABELS ? raw : "month") as PeriodKey;
  const t = localYmd(tz, now);
  const tomorrow = zonedMidnight(tz, t.y, t.m, t.d + 1);
  let from: Date;
  let to = tomorrow;

  if (key === "today") from = zonedMidnight(tz, t.y, t.m, t.d);
  else if (key === "week") {
    const dow = (new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay() + 6) % 7; // Monday = 0
    from = zonedMidnight(tz, t.y, t.m, t.d - dow);
  } else if (key === "quarter") from = zonedMidnight(tz, t.y, Math.floor((t.m - 1) / 3) * 3 + 1, 1);
  else if (key === "custom") {
    const a = parseYmd(sp.from as string) ?? { y: t.y, m: t.m, d: 1 };
    const b = parseYmd(sp.to as string) ?? t;
    from = zonedMidnight(tz, a.y, a.m, a.d);
    to = zonedMidnight(tz, b.y, b.m, b.d + 1);
    if (to <= from) to = zonedMidnight(tz, a.y, a.m, a.d + 1);
  } else from = zonedMidnight(tz, t.y, t.m, 1);

  const days = (to.getTime() - from.getTime()) / 86_400_000;
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: tz, day: "numeric", month: "short" });
  const last = new Date(to.getTime() - 1);
  return {
    key, from, to,
    label: key === "today" ? fmt(from) : `${fmt(from)} — ${fmt(last)}`,
    fromYmd: ymdKey(tz, from),
    toYmd: ymdKey(tz, last),
    bucket: days > 35 ? "week" : "day",
  };
}

/** Bucket boundaries (start instants) covering the period. */
export function buckets(tz: string, p: Period) {
  const out: { start: Date; label: string }[] = [];
  const s = localYmd(tz, p.from);
  let i = 0;
  if (p.bucket === "week") {
    const dow = (new Date(Date.UTC(s.y, s.m - 1, s.d)).getUTCDay() + 6) % 7;
    let start = zonedMidnight(tz, s.y, s.m, s.d - dow);
    while (start < p.to && i++ < 60) {
      out.push({ start, label: start.toLocaleDateString("ru-RU", { timeZone: tz, day: "numeric", month: "short" }) });
      const l = localYmd(tz, start);
      start = zonedMidnight(tz, l.y, l.m, l.d + 7);
    }
  } else {
    let start = p.from;
    while (start < p.to && i++ < 400) {
      out.push({ start, label: start.toLocaleDateString("ru-RU", { timeZone: tz, day: "numeric", month: "short" }) });
      const l = localYmd(tz, start);
      start = zonedMidnight(tz, l.y, l.m, l.d + 1);
    }
  }
  return out;
}

export const TIMEZONES = [
  "Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk",
  "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka",
  "Europe/Minsk", "Europe/Kyiv", "Asia/Almaty", "Asia/Tashkent", "Asia/Bishkek", "Asia/Dushanbe", "Asia/Baku",
  "Asia/Tbilisi", "Asia/Yerevan", "Europe/Istanbul", "Asia/Dubai", "Europe/Berlin", "Europe/London", "UTC",
];
