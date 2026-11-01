import Link from "next/link";
import { requireOrg, formatDate, isOverdue } from "@/lib/org";
import { addTask, toggleTask } from "../actions";

export default async function TasksPage({ params, searchParams }: PageProps<"/o/[slug]/tasks">) {
  const { slug } = await params;
  const sp = await searchParams;
  const showDone = sp.done === "1";
  const { supabase, org, userId, canEdit } = await requireOrg(slug);
  const mine = sp.all !== "1";
  let q = supabase.from("tasks").select("id, title, due_at, done, deal_id, contact_id, deals(title), contacts(first_name, last_name)")
    .eq("organization_id", org.id).eq("done", showDone).order("due_at", { nullsFirst: false }).limit(300);
  if (mine) q = q.eq("assignee_id", userId);
  const { data: tasks } = await q;
  const path = `/o/${slug}/tasks`;
  const tab = (label: string, href: string, active: boolean) => (
    <Link href={href} className={`rounded-full px-3 py-1 text-sm ${active ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{label}</Link>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Задачи</h1>
      <div className="flex flex-wrap gap-2">
        {tab("Мои", `${path}?done=${showDone ? 1 : 0}`, mine)}
        {tab("Все", `${path}?all=1&done=${showDone ? 1 : 0}`, !mine)}
        <span className="w-4" />
        {tab("Открытые", `${path}?${mine ? "" : "all=1&"}done=0`, !showDone)}
        {tab("Выполненные", `${path}?${mine ? "" : "all=1&"}done=1`, showDone)}
      </div>
      {canEdit && (
        <form action={addTask} className="card flex flex-wrap gap-2">
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="path" value={path} />
          <input name="title" className="input flex-1" placeholder="Новая задача" required />
          <input name="due_at" type="datetime-local" className="input w-auto" />
          <button className="btn">Добавить</button>
        </form>
      )}
      <div className="card divide-y divide-slate-100 p-0">
        {(tasks ?? []).length === 0 && <p className="p-4 text-sm text-slate-500">Задач нет</p>}
        {(tasks ?? []).map((t) => {
          const deal = t.deals as unknown as { title: string } | null;
          const contact = t.contacts as unknown as { first_name: string; last_name: string | null } | null;
          return (
            <form key={t.id} action={toggleTask} className="flex items-center gap-3 p-3 text-sm">
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="path" value={path} />
              <input type="hidden" name="id" value={t.id} /><input type="hidden" name="done" value={String(!t.done)} />
              <button disabled={!canEdit} className={`h-4 w-4 shrink-0 rounded border ${t.done ? "border-green-500 bg-green-500" : "border-slate-400"}`} aria-label="Готово" />
              <div className="min-w-0 flex-1">
                <div className={t.done ? "text-slate-400 line-through" : ""}>{t.title}</div>
                {deal && <Link href={`/o/${slug}/deals/${t.deal_id}`} className="text-xs text-indigo-600">{deal.title}</Link>}
                {contact && <Link href={`/o/${slug}/contacts/${t.contact_id}`} className="text-xs text-indigo-600">{contact.first_name} {contact.last_name}</Link>}
              </div>
              {t.due_at && <span className={`text-xs ${isOverdue(t.due_at, t.done) ? "text-red-600" : "text-slate-500"}`}>{formatDate(t.due_at)}</span>}
            </form>
          );
        })}
      </div>
    </div>
  );
}
