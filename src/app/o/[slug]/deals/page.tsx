import Link from "next/link";
import { requireOrg, type FieldDef } from "@/lib/org";
import { Kanban } from "@/components/Kanban";
import { CustomFieldInputs } from "@/components/CustomFields";
import { saveDeal } from "../actions";

export default async function DealsPage({ params, searchParams }: PageProps<"/o/[slug]/deals">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, org, canEdit } = await requireOrg(slug);
  const { data: pipelines } = await supabase.from("pipelines").select("id, name").eq("organization_id", org.id).order("position").order("created_at");
  const pipelineId = (typeof sp.p === "string" && pipelines?.find((p) => p.id === sp.p)?.id) || pipelines?.[0]?.id;

  const [{ data: stages }, { data: deals }, { data: contacts }, { data: defs }] = await Promise.all([
    supabase.from("stages").select("id, name, color, kind").eq("pipeline_id", pipelineId ?? "").order("position"),
    supabase.from("deals").select("id, title, amount, stage_id, contacts(first_name, last_name)").eq("pipeline_id", pipelineId ?? "").order("created_at", { ascending: false }),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", org.id).order("first_name").limit(500),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).eq("entity", "deal").order("position"),
  ]);

  const list = (deals ?? []).map((d) => {
    const c = d.contacts as unknown as { first_name: string; last_name: string | null } | null;
    return { id: d.id, title: d.title, amount: Number(d.amount), stage_id: d.stage_id, contact: c ? `${c.first_name} ${c.last_name ?? ""}`.trim() : null };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Сделки</h1>
        <div className="flex gap-1">
          {(pipelines ?? []).map((p) => (
            <Link key={p.id} href={`/o/${slug}/deals?p=${p.id}`} className={`rounded-full px-3 py-1 text-sm ${p.id === pipelineId ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{p.name}</Link>
          ))}
        </div>
      </div>

      {canEdit && (stages ?? []).length > 0 && (
        <details className="card" open={sp.new === "1"}>
          <summary className="cursor-pointer text-sm font-medium text-indigo-600">+ Новая сделка</summary>
          <form action={saveDeal} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="slug" value={slug} />
            <div><label className="label">Название</label><input name="title" className="input" required /></div>
            <div><label className="label">Сумма</label><input name="amount" type="number" step="0.01" className="input" /></div>
            <div>
              <label className="label">Этап</label>
              <select name="stage_id" className="input">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </div>
            <div>
              <label className="label">Контакт</label>
              <select name="contact_id" className="input">
                <option value="">—</option>
                {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <CustomFieldInputs defs={(defs ?? []) as FieldDef[]} />
            <div className="flex items-end"><button className="btn">Создать</button></div>
          </form>
        </details>
      )}

      <Kanban slug={slug} stages={stages ?? []} deals={list} currency={org.currency} canEdit={canEdit} />
    </div>
  );
}
