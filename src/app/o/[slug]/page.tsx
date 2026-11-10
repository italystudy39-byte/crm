import Link from "next/link";
import { requireOrg, formatMoney, formatDate, nowMs } from "@/lib/org";
import { resolvePeriod, buckets } from "@/lib/period";
import { PeriodFilter } from "@/components/PeriodFilter";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Funnel } from "@/components/dashboard/Funnel";
import { ActivityFeed, type FeedItem } from "@/components/dashboard/ActivityFeed";

export default async function Dashboard({ params, searchParams }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, org } = await requireOrg(slug);
  const tz = org.timezone;
  const now = nowMs();
  const period = resolvePeriod(tz, sp, new Date(now));
  const from = period.from.toISOString();
  const to = period.to.toISOString();
  const span = period.to.getTime() - period.from.getTime();
  const prevFrom = new Date(period.from.getTime() - span).toISOString();

  const { data: pipelines } = await supabase.from("pipelines").select("id, name").eq("organization_id", org.id).order("position").order("created_at");
  const pipelineId = (typeof sp.p === "string" && pipelines?.find((p) => p.id === sp.p)?.id) || pipelines?.[0]?.id || "";

  const [
    { data: allStages }, { data: openDeals }, { data: won }, { data: prevWon },
    { count: newDeals }, { count: newContacts }, { data: funnelDeals }, { data: acts }, { data: overdue },
  ] = await Promise.all([
    supabase.from("stages").select("id, name, color, kind, position, pipeline_id").eq("organization_id", org.id).order("position"),
    supabase.from("deals").select("amount, stages!inner(kind)").eq("organization_id", org.id).eq("stages.kind", "open"),
    supabase.from("deals").select("amount, closed_at, stages!inner(kind)").eq("organization_id", org.id).eq("stages.kind", "won").gte("closed_at", from).lt("closed_at", to),
    supabase.from("deals").select("amount, stages!inner(kind)").eq("organization_id", org.id).eq("stages.kind", "won").gte("closed_at", prevFrom).lt("closed_at", from),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("organization_id", org.id).gte("created_at", from).lt("created_at", to),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id).gte("created_at", from).lt("created_at", to),
    supabase.from("deals").select("amount, reached_position, stage_id").eq("pipeline_id", pipelineId).gte("created_at", from).lt("created_at", to),
    supabase.from("activities").select("id, type, body, created_at, author_id, deals(id, title), contacts(id, first_name, last_name)")
      .eq("organization_id", org.id).gte("created_at", from).lt("created_at", to).order("created_at", { ascending: false }).limit(15),
    supabase.from("tasks").select("id, title, due_at, deal_id").eq("organization_id", org.id).eq("done", false).lt("due_at", new Date(now).toISOString()).order("due_at").limit(8),
  ]);

  // ---- KPIs
  const sum = (rows: { amount: number | string }[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const openSum = sum(openDeals);
  const wonSum = sum(won);
  const prevWonSum = sum(prevWon);
  const delta = prevWonSum > 0 ? Math.round(((wonSum - prevWonSum) / prevWonSum) * 100) : null;

  // ---- Revenue by bucket
  const bk = buckets(tz, period);
  const points = bk.map((b) => ({ label: b.label, value: 0, count: 0 }));
  for (const d of won ?? []) {
    const t = new Date(d.closed_at!).getTime();
    let i = bk.length - 1;
    while (i > 0 && bk[i].start.getTime() > t) i--;
    points[i].value += Number(d.amount);
    points[i].count++;
  }

  // ---- Funnel for the selected pipeline
  const stages = (allStages ?? []).filter((s) => s.pipeline_id === pipelineId);
  const steps = stages.filter((s) => s.kind !== "lost").map((s) => {
    const reached = (funnelDeals ?? []).filter((d) => d.reached_position >= s.position);
    return { id: s.id, name: s.name, color: s.color, count: reached.length, amount: sum(reached) };
  });
  // First step counts every deal created in the period, whatever happened later.
  if (steps[0]) { steps[0].count = funnelDeals?.length ?? 0; steps[0].amount = sum(funnelDeals); }
  const lostIds = new Set(stages.filter((s) => s.kind === "lost").map((s) => s.id));
  const lost = (funnelDeals ?? []).filter((d) => lostIds.has(d.stage_id)).length;

  // ---- Activity feed
  const authorIds = [...new Set((acts ?? []).map((a) => a.author_id).filter(Boolean))] as string[];
  const { data: profiles } = authorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", authorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
  const feed: FeedItem[] = (acts ?? []).map((a) => {
    const deal = a.deals as unknown as { id: string; title: string } | null;
    const c = a.contacts as unknown as { id: string; first_name: string; last_name: string | null } | null;
    return {
      id: a.id, type: a.type, body: a.body, created_at: a.created_at,
      author: a.author_id ? names.get(a.author_id) ?? null : null,
      deal, contact: c ? { id: c.id, name: `${c.first_name} ${c.last_name ?? ""}`.trim() } : null,
    };
  });

  const kpi = "card";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Сводка</h1>
          <p className="text-sm text-slate-500">{period.label}</p>
        </div>
        <PeriodFilter current={period.key} fromYmd={period.fromYmd} toYmd={period.toYmd} label={period.label} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={kpi}>
          <div className="text-sm text-slate-500">Выиграно за период</div>
          <div className="text-2xl font-semibold text-green-600">{formatMoney(wonSum, org.currency)}</div>
          <div className="text-xs text-slate-500">
            {won?.length ?? 0} сделок
            {delta !== null && <span className={delta >= 0 ? "ml-2 text-green-600" : "ml-2 text-red-600"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% к прошлому периоду</span>}
          </div>
        </div>
        <div className={kpi}>
          <div className="text-sm text-slate-500">В работе сейчас</div>
          <div className="text-2xl font-semibold">{formatMoney(openSum, org.currency)}</div>
          <div className="text-xs text-slate-500">{openDeals?.length ?? 0} открытых сделок</div>
        </div>
        <div className={kpi}>
          <div className="text-sm text-slate-500">Новых сделок</div>
          <div className="text-2xl font-semibold">{newDeals ?? 0}</div>
          <div className="text-xs text-slate-500">за период</div>
        </div>
        <div className={kpi}>
          <div className="text-sm text-slate-500">Новых контактов</div>
          <div className="text-2xl font-semibold">{newContacts ?? 0}</div>
          <div className="text-xs text-slate-500">за период</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-medium">Выручка по выигранным сделкам</h2>
            <span className="text-xs text-slate-500">по {period.bucket === "day" ? "дням" : "неделям"}</span>
          </div>
          <RevenueChart points={points} currency={org.currency} bucket={period.bucket} />
        </div>
        <div className="card lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Воронка конверсии</h2>
            {(pipelines?.length ?? 0) > 1 && (
              <div className="flex gap-1">
                {pipelines!.map((p) => {
                  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
                  q.set("p", p.id);
                  return <Link key={p.id} href={`/o/${slug}?${q}`} className={`rounded-full px-2 py-0.5 text-xs ${p.id === pipelineId ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-600"}`}>{p.name}</Link>;
                })}
              </div>
            )}
          </div>
          <Funnel steps={steps} lost={lost} currency={org.currency} />
          <p className="mt-2 text-[11px] text-slate-400">Сделки, созданные за период: сколько дошло до каждого этапа.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <h2 className="mb-3 font-medium">Последняя активность</h2>
          <ActivityFeed slug={slug} items={feed} now={now} />
        </div>
        <div className="card space-y-2 lg:col-span-2">
          <h2 className="font-medium">Просроченные задачи</h2>
          {(overdue ?? []).length === 0 && <p className="text-sm text-slate-500">Нет просроченных задач</p>}
          {(overdue ?? []).map((t) => (
            <div key={t.id} className="flex justify-between gap-2 text-sm">
              {t.deal_id ? <Link className="truncate text-indigo-600 hover:underline" href={`/o/${slug}/deals/${t.deal_id}`}>{t.title}</Link> : <span className="truncate">{t.title}</span>}
              <span className="shrink-0 text-red-600">{formatDate(t.due_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
