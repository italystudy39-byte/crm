import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg, formatMoney, type FieldDef } from "@/lib/org";
import { CustomFieldInputs } from "@/components/CustomFields";
import { Timeline } from "@/components/Timeline";
import { DealAiButtons } from "@/components/AskAiButtons";
import { saveDeal, deleteDeal } from "../../actions";

export default async function DealPage({ params }: PageProps<"/o/[slug]/deals/[id]">) {
  const { slug, id } = await params;
  const { supabase, org, canEdit } = await requireOrg(slug);
  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!deal) notFound();

  const [{ data: stages }, { data: contacts }, { data: companies }, { data: defs }, { data: activities }, { data: tasks }] = await Promise.all([
    supabase.from("stages").select("id, name").eq("pipeline_id", deal.pipeline_id).order("position"),
    supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", org.id).order("first_name").limit(500),
    supabase.from("companies").select("id, name").eq("organization_id", org.id).order("name").limit(500),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).eq("entity", "deal").order("position"),
    supabase.from("activities").select("id, type, body, created_at, author_id").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, title, due_at, done").eq("deal_id", id).order("done").order("due_at"),
  ]);
  const authorIds = [...new Set((activities ?? []).map((a) => a.author_id).filter(Boolean))] as string[];
  const { data: profiles } = authorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", authorIds) : { data: [] };
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const acts = (activities ?? []).map((a) => ({ ...a, profiles: a.author_id ? pmap.get(a.author_id) ?? null : null }));
  const path = `/o/${slug}/deals/${id}`;

  return (
    <div className="space-y-4">
      <Link href={`/o/${slug}/deals?p=${deal.pipeline_id}`} className="text-sm text-indigo-600">← Все сделки</Link>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{deal.title}</h1>
        <div className="text-xl">{formatMoney(deal.amount, org.currency)}</div>
      </div>
      <DealAiButtons dealId={id} dealTitle={deal.title} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form action={saveDeal} className="card grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="id" value={id} />
          <fieldset disabled={!canEdit} className="contents">
            <div className="sm:col-span-2"><label className="label">Название</label><input name="title" defaultValue={deal.title} className="input" required /></div>
            <div><label className="label">Сумма</label><input name="amount" type="number" step="0.01" defaultValue={deal.amount} className="input" /></div>
            <div><label className="label">Этап</label>
              <select name="stage_id" defaultValue={deal.stage_id} className="input">{(stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </div>
            <div><label className="label">Контакт</label>
              <select name="contact_id" defaultValue={deal.contact_id ?? ""} className="input">
                <option value="">—</option>{(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
            <div><label className="label">Компания</label>
              <select name="company_id" defaultValue={deal.company_id ?? ""} className="input">
                <option value="">—</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <CustomFieldInputs defs={(defs ?? []) as FieldDef[]} values={deal.custom ?? {}} />
            {canEdit && <div className="sm:col-span-2"><button className="btn">Сохранить</button></div>}
          </fieldset>
          {deal.contact_id && <Link className="text-sm text-indigo-600 sm:col-span-2" href={`/o/${slug}/contacts/${deal.contact_id}`}>Открыть контакт →</Link>}
        </form>
        <Timeline slug={slug} path={path} target={{ deal_id: id }} activities={acts} tasks={tasks ?? []} canEdit={canEdit} />
      </div>
      {canEdit && (
        <form action={deleteDeal}>
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} />
          <button className="btn-danger">Удалить сделку</button>
        </form>
      )}
    </div>
  );
}
