import { headers } from "next/headers";
import { requireOrg, ROLE_LABELS, type Role } from "@/lib/org";
import {
  updateOrg, inviteMember, revokeInvite, changeRole, removeMember,
  saveStage, deleteStage, addPipeline, addField, deleteField,
} from "../actions";

const FIELD_TYPES = { text: "Текст", number: "Число", date: "Дата", select: "Список", boolean: "Да/нет" };
const ENTITIES = { contact: "Контакт", company: "Компания", deal: "Сделка" };
const KINDS = { open: "В работе", won: "Успешно", lost: "Отказ" };

export default async function SettingsPage({ params, searchParams }: PageProps<"/o/[slug]/settings">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, org, isAdmin, role: myRole, userId } = await requireOrg(slug);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  const [{ data: members }, { data: invites }, { data: pipelines }, { data: stages }, { data: fields }] = await Promise.all([
    supabase.from("memberships").select("user_id, role").eq("organization_id", org.id),
    isAdmin ? supabase.from("invitations").select("id, email, role, token, expires_at").eq("organization_id", org.id).is("accepted_at", null) : Promise.resolve({ data: [] }),
    supabase.from("pipelines").select("id, name").eq("organization_id", org.id).order("position").order("created_at"),
    supabase.from("stages").select("id, name, color, kind, position, pipeline_id").eq("organization_id", org.id).order("position"),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).order("entity").order("position"),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const hidden = <input type="hidden" name="slug" value={slug} />;
  const roles = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== "owner" || myRole === "owner");

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Настройки</h1>
      {typeof sp.error === "string" && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{sp.error}</p>}
      {!isAdmin && <p className="text-sm text-slate-500">Менять настройки могут только владелец и администраторы.</p>}

      <section className="card space-y-3">
        <h2 className="font-medium">Компания</h2>
        <form action={updateOrg} className="flex flex-wrap items-end gap-3">
          {hidden}
          <fieldset disabled={!isAdmin} className="contents">
            <div className="flex-1"><label className="label">Название</label><input name="name" defaultValue={org.name} className="input" /></div>
            <div><label className="label">Валюта</label>
              <select name="currency" defaultValue={org.currency} className="input">
                {["RUB", "USD", "EUR", "KZT", "UAH", "BYN", "UZS", "AMD", "GEL"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            {isAdmin && <button className="btn">Сохранить</button>}
          </fieldset>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Сотрудники</h2>
        <table className="w-full">
          <tbody>
            {(members ?? []).map((m) => {
              const p = pmap.get(m.user_id);
              const editable = isAdmin && m.user_id !== userId && (m.role !== "owner" || myRole === "owner");
              return (
                <tr key={m.user_id}>
                  <td className="td">{p?.full_name}<div className="text-xs text-slate-500">{p?.email}</div></td>
                  <td className="td">
                    {editable ? (
                      <form action={changeRole} className="flex gap-2">
                        {hidden}<input type="hidden" name="user_id" value={m.user_id} />
                        <select name="role" defaultValue={m.role} className="input w-auto">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
                        <button className="btn-ghost">OK</button>
                      </form>
                    ) : ROLE_LABELS[m.role as Role]}
                  </td>
                  <td className="td text-right">
                    {editable && (
                      <form action={removeMember}>{hidden}<input type="hidden" name="user_id" value={m.user_id} /><button className="btn-danger">Убрать</button></form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isAdmin && (
          <>
            <form action={inviteMember} className="flex flex-wrap gap-2">
              {hidden}
              <input name="email" type="email" className="input flex-1" placeholder="email сотрудника" required />
              <select name="role" defaultValue="manager" className="input w-auto">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
              <button className="btn">Пригласить</button>
            </form>
            {(invites ?? []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">Отправьте сотруднику ссылку. Он должен войти с тем же email.</div>
                {(invites ?? []).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
                    <span className="font-medium">{i.email}</span>
                    <span className="text-slate-500">{ROLE_LABELS[i.role as Role]}</span>
                    <input readOnly className="input flex-1 font-mono text-xs" value={`${origin}/invite/${i.token}`} />
                    <form action={revokeInvite}>{hidden}<input type="hidden" name="id" value={i.id} /><button className="btn-danger">Отменить</button></form>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">Воронки и этапы</h2>
        {(pipelines ?? []).map((p) => (
          <div key={p.id} className="space-y-2">
            <div className="font-medium">{p.name}</div>
            {(stages ?? []).filter((s) => s.pipeline_id === p.id).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2">
                <form action={saveStage} className="flex flex-1 flex-wrap items-center gap-2">
                  {hidden}<input type="hidden" name="id" value={s.id} />
                  <fieldset disabled={!isAdmin} className="contents">
                    <input name="position" type="number" defaultValue={s.position} className="input w-16" />
                    <input name="color" type="color" defaultValue={s.color} className="h-9 w-10 rounded border border-slate-300" />
                    <input name="name" defaultValue={s.name} className="input flex-1" />
                    <select name="kind" defaultValue={s.kind} className="input w-auto">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    {isAdmin && <button className="btn-ghost">Сохранить</button>}
                  </fieldset>
                </form>
                {isAdmin && <form action={deleteStage}>{hidden}<input type="hidden" name="id" value={s.id} /><button className="btn-danger">×</button></form>}
              </div>
            ))}
            {isAdmin && (
              <form action={saveStage} className="flex flex-wrap items-center gap-2">
                {hidden}<input type="hidden" name="pipeline_id" value={p.id} />
                <input name="position" type="number" defaultValue={(stages ?? []).filter((s) => s.pipeline_id === p.id).length} className="input w-16" />
                <input name="color" type="color" defaultValue="#64748b" className="h-9 w-10 rounded border border-slate-300" />
                <input name="name" className="input flex-1" placeholder="Новый этап" required />
                <input type="hidden" name="kind" value="open" />
                <button className="btn-ghost">+ Этап</button>
              </form>
            )}
          </div>
        ))}
        {isAdmin && (
          <form action={addPipeline} className="flex gap-2 border-t border-slate-100 pt-3">
            {hidden}<input name="name" className="input flex-1" placeholder="Название новой воронки" required /><button className="btn">+ Воронка</button>
          </form>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Дополнительные поля</h2>
        <p className="text-sm text-slate-500">Поля под ваш бизнес: например «Источник», «Дата рождения», «Тип услуги».</p>
        {(fields ?? []).map((f) => (
          <div key={f.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-slate-500">{ENTITIES[f.entity as keyof typeof ENTITIES]}</span>
            <span className="flex-1 font-medium">{f.label}</span>
            <span className="text-slate-500">{FIELD_TYPES[f.field_type as keyof typeof FIELD_TYPES]}{f.options?.length ? `: ${f.options.join(", ")}` : ""}</span>
            {isAdmin && <form action={deleteField}>{hidden}<input type="hidden" name="id" value={f.id} /><button className="btn-danger">×</button></form>}
          </div>
        ))}
        {isAdmin && (
          <form action={addField} className="grid gap-2 sm:grid-cols-5">
            {hidden}
            <select name="entity" className="input">{Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="label" className="input" placeholder="Название поля" required />
            <select name="field_type" className="input">{Object.entries(FIELD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input name="options" className="input" placeholder="Варианты через запятую" />
            <button className="btn">+ Поле</button>
          </form>
        )}
      </section>
    </div>
  );
}
