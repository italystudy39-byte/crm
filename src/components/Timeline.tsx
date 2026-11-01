import { addActivity, addTask, toggleTask } from "@/app/o/[slug]/actions";
import { formatDate, isOverdue } from "@/lib/org";

const TYPE_LABEL: Record<string, string> = { note: "Заметка", call: "Звонок", meeting: "Встреча", email: "Письмо", stage_change: "Смена этапа" };

type Activity = { id: string; type: string; body: string | null; created_at: string; profiles: { full_name: string | null } | null };
type Task = { id: string; title: string; due_at: string | null; done: boolean };

export function Timeline({ slug, path, target, activities, tasks, canEdit }: {
  slug: string; path: string; target: { deal_id?: string; contact_id?: string };
  activities: Activity[]; tasks: Task[]; canEdit: boolean;
}) {
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="path" value={path} />
      {target.deal_id && <input type="hidden" name="deal_id" value={target.deal_id} />}
      {target.contact_id && <input type="hidden" name="contact_id" value={target.contact_id} />}
    </>
  );
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-medium">Задачи</h2>
        {canEdit && (
          <form action={addTask} className="flex flex-wrap gap-2">
            {hidden}
            <input name="title" className="input flex-1" placeholder="Что сделать?" required />
            <input name="due_at" type="datetime-local" className="input w-auto" />
            <button className="btn">Добавить</button>
          </form>
        )}
        {tasks.length === 0 && <p className="text-sm text-slate-500">Задач нет</p>}
        {tasks.map((t) => (
          <form key={t.id} action={toggleTask} className="flex items-center gap-2 text-sm">
            {hidden}
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="done" value={String(!t.done)} />
            <button disabled={!canEdit} className={`h-4 w-4 rounded border ${t.done ? "border-green-500 bg-green-500" : "border-slate-400"}`} aria-label="Готово" />
            <span className={t.done ? "text-slate-400 line-through" : ""}>{t.title}</span>
            {t.due_at && <span className={`ml-auto text-xs ${isOverdue(t.due_at, t.done) ? "text-red-600" : "text-slate-500"}`}>{formatDate(t.due_at)}</span>}
          </form>
        ))}
      </div>
      <div className="card space-y-3">
        <h2 className="font-medium">История</h2>
        {canEdit && (
          <form action={addActivity} className="space-y-2">
            {hidden}
            <textarea name="body" className="input" rows={2} placeholder="Заметка, итог звонка или встречи…" required />
            <div className="flex gap-2">
              <select name="type" className="input w-auto">
                <option value="note">Заметка</option><option value="call">Звонок</option><option value="meeting">Встреча</option><option value="email">Письмо</option>
              </select>
              <button className="btn">Сохранить</button>
            </div>
          </form>
        )}
        {activities.length === 0 && <p className="text-sm text-slate-500">Пока пусто</p>}
        <ul className="space-y-3">
          {activities.map((a) => (
            <li key={a.id} className="border-l-2 border-slate-200 pl-3 text-sm">
              <div className="text-xs text-slate-500">{TYPE_LABEL[a.type] ?? a.type} · {a.profiles?.full_name ?? ""} · {formatDate(a.created_at)}</div>
              <div className="whitespace-pre-wrap">{a.body}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
