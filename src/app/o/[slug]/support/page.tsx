import { requireOrg } from "@/lib/org";
import { ContactSupportButton } from "@/components/ContactSupportButton";
import { updateTicket } from "../actions";

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Открыт", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  in_progress: { label: "В работе", cls: "bg-indigo-50 text-indigo-700" },
  resolved: { label: "Решён", cls: "bg-green-50 text-green-700" },
};

type Turn = { role: "user" | "assistant"; content: string };

export default async function SupportPage({ params, searchParams }: PageProps<"/o/[slug]/support">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, org, userId, isAdmin } = await requireOrg(slug);
  const mine = !isAdmin || sp.all !== "1";
  let q = supabase
    .from("support_tickets")
    .select("id, issue_description, status, resolution, conversation, created_at, updated_at, user_id")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (mine) q = q.eq("user_id", userId);
  const { data: tickets } = await q;
  const authorIds = [...new Set((tickets ?? []).map((t) => t.user_id))];
  const { data: profiles } = isAdmin && authorIds.length ? await supabase.from("profiles").select("id, email, full_name").in("id", authorIds) : { data: [] };
  const who = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  const fmt = (d: string) => new Date(d).toLocaleString("ru-RU", { timeZone: org.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const base = `/o/${slug}/support`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Поддержка</h1>
          <p className="text-sm text-slate-500">AI-ассистент отвечает сразу. Если нужен человек, он создаёт тикет, и его статус виден здесь.</p>
        </div>
        <ContactSupportButton />
      </div>
      {isAdmin && (
        <div className="flex gap-2">
          <a href={base} className={`rounded-full px-3 py-1 text-sm ${mine ? "bg-indigo-600 text-white" : "border border-slate-200 bg-surface text-slate-600"}`}>Мои</a>
          <a href={`${base}?all=1`} className={`rounded-full px-3 py-1 text-sm ${!mine ? "bg-indigo-600 text-white" : "border border-slate-200 bg-surface text-slate-600"}`}>Все тикеты команды</a>
        </div>
      )}
      {(tickets ?? []).length === 0 ? (
        <div className="card text-sm text-slate-500">Обращений пока нет. Нажмите на кнопку ассистента в правом нижнем углу и задайте вопрос.</div>
      ) : (
        <div className="space-y-3">
          {(tickets ?? []).map((t) => {
            const st = STATUS[t.status] ?? STATUS.open;
            const conv = (t.conversation ?? []) as Turn[];
            return (
              <div key={t.id} id={t.id} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${st.cls}`}>{st.label}</span>
                  <span>#{t.id.slice(0, 8)}</span>
                  <span>· {fmt(t.created_at)}</span>
                  {isAdmin && who.get(t.user_id) && <span>· {who.get(t.user_id)}</span>}
                  {t.updated_at !== t.created_at && <span>· обновлён {fmt(t.updated_at)}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm">{t.issue_description}</p>
                {t.resolution && (
                  <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                    <span className="font-medium">Ответ поддержки: </span>{t.resolution}
                  </div>
                )}
                {conv.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-indigo-600">Переписка с ассистентом ({conv.length})</summary>
                    <div className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
                      {conv.map((m, i) => (
                        <div key={i} className="whitespace-pre-wrap">
                          <span className="text-xs font-medium text-slate-500">{m.role === "user" ? "Пользователь" : "Ассистент"}: </span>
                          {m.content}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {isAdmin && (
                  <form action={updateTicket} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={t.id} />
                    <select name="status" defaultValue={t.status} className="input w-auto">
                      <option value="open">Открыт</option>
                      <option value="in_progress">В работе</option>
                      <option value="resolved">Решён</option>
                    </select>
                    <input name="resolution" defaultValue={t.resolution ?? ""} placeholder="Ответ пользователю" className="input min-w-0 flex-1" />
                    <button className="btn-ghost">Сохранить</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
