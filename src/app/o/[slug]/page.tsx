import Link from "next/link";
import { requireOrg, formatMoney, formatDate } from "@/lib/org";

export default async function Dashboard({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const { supabase, org } = await requireOrg(slug);
  const now = new Date().toISOString();
  const [{ data: stages }, { data: deals }, { count: contactsCount }, { data: overdue }] = await Promise.all([
    supabase.from("stages").select("id, name, color, kind, position, pipeline_id").eq("organization_id", org.id).order("position"),
    supabase.from("deals").select("id, stage_id, amount").eq("organization_id", org.id),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("tasks").select("id, title, due_at, deal_id").eq("organization_id", org.id).eq("done", false).lt("due_at", now).order("due_at").limit(10),
  ]);

  const byStage = new Map<string, { count: number; sum: number }>();
  for (const d of deals ?? []) {
    const s = byStage.get(d.stage_id) ?? { count: 0, sum: 0 };
    s.count++; s.sum += Number(d.amount);
    byStage.set(d.stage_id, s);
  }
  const kindOf = new Map((stages ?? []).map((s) => [s.id, s.kind]));
  let open = 0, won = 0;
  for (const d of deals ?? []) {
    const k = kindOf.get(d.stage_id);
    if (k === "open") open += Number(d.amount);
    if (k === "won") won += Number(d.amount);
  }
  const maxCount = Math.max(1, ...[...byStage.values()].map((v) => v.count));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Сводка</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-sm text-slate-500">В работе</div><div className="text-2xl font-semibold">{formatMoney(open, org.currency)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Выиграно</div><div className="text-2xl font-semibold text-green-600">{formatMoney(won, org.currency)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Контактов</div><div className="text-2xl font-semibold">{contactsCount ?? 0}</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-medium">Сделки по этапам</h2>
          {(stages ?? []).map((s) => {
            const v = byStage.get(s.id) ?? { count: 0, sum: 0 };
            return (
              <div key={s.id}>
                <div className="flex justify-between text-sm"><span>{s.name}</span><span className="text-slate-500">{v.count} · {formatMoney(v.sum, org.currency)}</span></div>
                <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${(v.count / maxCount) * 100}%`, background: s.color }} /></div>
              </div>
            );
          })}
        </div>
        <div className="card space-y-2">
          <h2 className="font-medium">Просроченные задачи</h2>
          {(overdue ?? []).length === 0 && <p className="text-sm text-slate-500">Нет просроченных задач</p>}
          {(overdue ?? []).map((t) => (
            <div key={t.id} className="flex justify-between text-sm">
              {t.deal_id ? <Link className="text-indigo-600 hover:underline" href={`/o/${slug}/deals/${t.deal_id}`}>{t.title}</Link> : <span>{t.title}</span>}
              <span className="text-red-600">{formatDate(t.due_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
