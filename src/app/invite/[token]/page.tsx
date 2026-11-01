import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}&message=${encodeURIComponent("Войдите или зарегистрируйтесь с email, на который пришло приглашение")}`);
  }
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { inv_token: token });
  if (error || !orgId) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card max-w-sm space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold">Приглашение недействительно</h1>
          <p className="text-sm text-slate-500">
            Ссылка устарела, уже использована или выдана на другой email.
          </p>
          <Link href="/" className="btn">На главную</Link>
        </div>
      </main>
    );
  }
  const { data: org } = await supabase.from("organizations").select("slug").eq("id", orgId).single();
  redirect(org ? `/o/${org.slug}` : "/");
}
