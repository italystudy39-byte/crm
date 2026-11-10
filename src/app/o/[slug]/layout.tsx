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
      <aside className="border-b border-slate-200 bg-white p-3 md:w-56 md:border-b-0 md:border-r">
        <div className="mb-3 px-2">
          <div className="truncate font-semibold">{org.name}</div>
          <div className="truncate text-xs text-slate-500">{email}</div>
        </div>
        <Nav slug={slug} />
        <div className="mt-4 hidden space-y-1 border-t border-slate-100 pt-3 md:block">
          {list.length > 1 && (
            <>
              <div className="px-2 text-xs text-slate-400">Другие пространства</div>
              {list.filter((o) => o.slug !== slug).map((o) => (
                <Link key={o.slug} href={`/o/${o.slug}`} className="block truncate rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">{o.name}</Link>
              ))}
            </>
          )}
          <Link href="/onboarding" className="block rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">+ Новое пространство</Link>
          <form action={signOut}><button className="w-full rounded px-2 py-1 text-left text-sm text-slate-500 hover:bg-slate-100">Выйти</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar slug={slug} canEdit={canEdit} notifications={notifications} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
