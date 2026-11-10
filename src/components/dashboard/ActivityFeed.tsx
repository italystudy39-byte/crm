import Link from "next/link";

export type FeedItem = {
  id: string; type: string; body: string | null; created_at: string;
  author: string | null; deal: { id: string; title: string } | null; contact: { id: string; name: string } | null;
};

const ICON: Record<string, { c: string; t: string }> = {
  deal_created: { c: "bg-indigo-500", t: "+" },
  contact_created: { c: "bg-sky-500", t: "+" },
  stage_change: { c: "bg-violet-500", t: "→" },
  task_done: { c: "bg-green-500", t: "✓" },
  call: { c: "bg-amber-500", t: "☎" },
  meeting: { c: "bg-amber-500", t: "●" },
  email: { c: "bg-amber-500", t: "@" },
  note: { c: "bg-slate-400", t: "✎" },
};

function ago(iso: string, now: number) {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function ActivityFeed({ slug, items, now }: { slug: string; items: FeedItem[]; now: number }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-400">За период событий нет</p>;
  const base = `/o/${slug}`;
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const ic = ICON[a.type] ?? ICON.note;
        const who = a.author ?? "Кто-то";
        const deal = a.deal ? <Link className="font-medium text-indigo-600 hover:underline" href={`${base}/deals/${a.deal.id}`}>{a.deal.title}</Link> : null;
        const contact = a.contact ? <Link className="font-medium text-indigo-600 hover:underline" href={`${base}/contacts/${a.contact.id}`}>{a.contact.name}</Link> : null;
        const target = deal ?? contact;
        let text: React.ReactNode;
        switch (a.type) {
          case "deal_created": text = <>{who} создал(а) сделку {target}</>; break;
          case "contact_created": text = <>{who} добавил(а) контакт {target}</>; break;
          case "stage_change": text = <>{who} перевёл(а) сделку {target} на этап «{(a.body ?? "").replace(/^Этап:\s*/, "")}»</>; break;
          case "task_done": text = <>{who} выполнил(а) задачу «{a.body}»{target && <> по {target}</>}</>; break;
          case "call": text = <>{who}: звонок{target && <> — {target}</>}. <span className="text-slate-500">{a.body}</span></>; break;
          case "meeting": text = <>{who}: встреча{target && <> — {target}</>}. <span className="text-slate-500">{a.body}</span></>; break;
          case "email": text = <>{who}: письмо{target && <> — {target}</>}. <span className="text-slate-500">{a.body}</span></>; break;
          default: text = <>{who} оставил(а) заметку{target && <> к {target}</>}: <span className="text-slate-500">{a.body}</span></>;
        }
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${ic.c}`}>{ic.t}</span>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2">{text}</div>
              <div className="text-xs text-slate-400">{ago(a.created_at, now)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
