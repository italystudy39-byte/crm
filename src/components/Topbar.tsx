import Link from "next/link";
import { CommandSearch } from "./CommandSearch";
import { ThemeToggle } from "./ThemeToggle";
import { formatDate } from "@/lib/org";

type Notif = { id: string; title: string; due_at: string | null; deal_id: string | null; contact_id: string | null; overdue: boolean };

export function Topbar({ slug, canEdit, notifications }: { slug: string; canEdit: boolean; notifications: Notif[] }) {
  const base = `/o/${slug}`;
  const overdue = notifications.filter((n) => n.overdue).length;
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-surface/90 px-4 py-2 backdrop-blur md:px-6">
      <CommandSearch slug={slug} />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        {canEdit && (
          <details className="relative">
            <summary className="btn list-none [&::-webkit-details-marker]:hidden">+ Создать</summary>
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-surface p-1 shadow-lg">
              <Link href={`${base}/deals?new=1`} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">Сделку</Link>
              <Link href={`${base}/contacts?new=1`} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">Контакт</Link>
              <Link href={`${base}/companies?new=1`} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">Компанию</Link>
              <Link href={`${base}/tasks`} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">Задачу</Link>
            </div>
          </details>
        )}
        <details className="relative">
          <summary aria-label="Уведомления" className="relative flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-surface hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {notifications.length > 0 && (
              <span className={`absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white ${overdue ? "bg-red-500" : "bg-indigo-600"}`}>
                {notifications.length > 9 ? "9+" : notifications.length}
              </span>
            )}
          </summary>
          <div className="absolute right-0 mt-1 w-80 rounded-lg border border-slate-200 bg-surface p-2 shadow-lg">
            <div className="px-2 pb-2 text-xs font-medium text-slate-500">Мои задачи на сегодня и просроченные</div>
            {notifications.length === 0 && <p className="px-2 pb-2 text-sm text-slate-500">Всё сделано</p>}
            {notifications.map((n) => (
              <Link
                key={n.id}
                href={n.deal_id ? `${base}/deals/${n.deal_id}` : n.contact_id ? `${base}/contacts/${n.contact_id}` : `${base}/tasks`}
                className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.overdue ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className={`shrink-0 text-xs ${n.overdue ? "text-red-600" : "text-slate-500"}`}>{n.overdue ? formatDate(n.due_at) : "сегодня"}</span>
              </Link>
            ))}
            <Link href={`${base}/tasks`} className="mt-1 block rounded px-2 py-1.5 text-center text-sm text-indigo-600 hover:bg-slate-50">Все задачи</Link>
          </div>
        </details>
      </div>
    </div>
  );
}
