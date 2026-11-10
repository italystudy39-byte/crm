import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireOrg, nowMs } from "@/lib/org";
import { Topbar } from "@/components/Topbar";
import { localYmd, zonedMidnight } from "@/lib/period";
import { signOut } from "@/app/login/actions";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const { org, email, supabase, userId, canEdit } = await requireOrg(slug);
  const { data: orgs } = await supabase
    .from("memberships")
    .select("organizations(name, slug)")
    .eq("user_id", userId);
  const now = new Date(nowMs());
  const t = localYmd(org.timezone, now);
  const endOfToday = zonedMidnight(org.timezone, t.y, t.m, t.d + 1);
  const { data: due } = await supabase
    .from("tasks")
    .select("id, title, due_at, deal_id, contact_id")
    .eq("organization_id", org.id)
    .eq("assignee_id", userId)
    .eq("done", false)
    .lt("due_at", endOfToday.toISOString())
    .order("due_at")
    .limit(20);
  const notifications = (due ?? []).map((n) => ({ ...n, overdue: new Date(n.due_at!).getTime() < now.getTime() }));
  const list = (orgs ?? []).map((o) => o.organizations as unknown as { name: string; slug: string });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col border-b border-slate-200 bg-surface p-3 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <Link href={`/o/${slug}`} className="mb-3 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">C</span>
          <span className="text-lg font-semibold tracking-tight">CRM</span>
        </Link>
        <Nav slug={slug} />
        <div className="mt-3 border-t border-slate-100 pt-3 md:mt-auto">
          <div className="hidden space-y-1 md:block">
            {list.length > 1 && (
              <>
                <div className="px-2 text-xs text-slate-400">Другие пространства</div>
                {list.filter((o) => o.slug !== slug).map((o) => (
                  <Link key={o.slug} href={`/o/${o.slug}`} className="block truncate rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">{o.name}</Link>
                ))}
              </>
            )}
            <Link href="/onboarding" className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">+ Новое пространство</Link>
          </div>
          <div className="flex items-center gap-2 px-2 md:mt-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{org.name}</div>
              <div className="truncate text-xs text-slate-500">{email}</div>
            </div>
            <form action={signOut}>
              <button title="Выйти" aria-label="Выйти" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar slug={slug} canEdit={canEdit} notifications={notifications} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
