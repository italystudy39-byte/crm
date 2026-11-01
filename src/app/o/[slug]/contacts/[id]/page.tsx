import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg, formatMoney, type FieldDef } from "@/lib/org";
import { CustomFieldInputs } from "@/components/CustomFields";
import { Timeline } from "@/components/Timeline";
import { saveContact, deleteContact } from "../../actions";

export default async function ContactPage({ params }: PageProps<"/o/[slug]/contacts/[id]">) {
  const { slug, id } = await params;
  const { supabase, org, canEdit } = await requireOrg(slug);
  const { data: c } = await supabase.from("contacts").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!c) notFound();
  const [{ data: companies }, { data: defs }, { data: deals }, { data: activities }, { data: tasks }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("organization_id", org.id).order("name").limit(500),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).eq("entity", "contact").order("position"),
    supabase.from("deals").select("id, title, amount, stages(name, color)").eq("contact_id", id),
    supabase.from("activities").select("id, type, body, created_at").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("id, title, due_at, done").eq("contact_id", id).order("done").order("due_at"),
  ]);
  const path = `/o/${slug}/contacts/${id}`;

  return (
    <div className="space-y-4">
      <Link href={`/o/${slug}/contacts`} className="text-sm text-indigo-600">← Все контакты</Link>
      <h1 className="text-2xl font-semibold">{c.first_name} {c.last_name}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <form action={saveContact} className="card grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} />
            <fieldset disabled={!canEdit} className="contents">
              <div><label className="label">Имя</label><input name="first_name" defaultValue={c.first_name} className="input" required /></div>
              <div><label className="label">Фамилия</label><input name="last_name" defaultValue={c.last_name ?? ""} className="input" /></div>
              <div><label className="label">Телефон</label><input name="phone" defaultValue={c.phone ?? ""} className="input" /></div>
              <div><label className="label">Email</label><input name="email" type="email" defaultValue={c.email ?? ""} className="input" /></div>
              <div><label className="label">Компания</label>
                <select name="company_id" defaultValue={c.company_id ?? ""} className="input"><option value="">—</option>{(companies ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              </div>
              <CustomFieldInputs defs={(defs ?? []) as FieldDef[]} values={c.custom ?? {}} />
              {canEdit && <div className="sm:col-span-2"><button className="btn">Сохранить</button></div>}
            </fieldset>
          </form>
          <div className="card space-y-2">
            <h2 className="font-medium">Сделки</h2>
            {(deals ?? []).length === 0 && <p className="text-sm text-slate-500">Сделок нет</p>}
            {(deals ?? []).map((d) => {
              const st = d.stages as unknown as { name: string; color: string } | null;
              return (
                <Link key={d.id} href={`/o/${slug}/deals/${d.id}`} className="flex items-center justify-between rounded-lg p-2 text-sm hover:bg-slate-50">
                  <span>{d.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: st?.color }}>{st?.name}</span>
                    {formatMoney(d.amount, org.currency)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <Timeline slug={slug} path={path} target={{ contact_id: id }} activities={(activities ?? []).map((a) => ({ ...a, profiles: null }))} tasks={tasks ?? []} canEdit={canEdit} />
      </div>
      {canEdit && (
        <form action={deleteContact}>
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} />
          <button className="btn-danger">Удалить контакт</button>
        </form>
      )}
    </div>
  );
}
