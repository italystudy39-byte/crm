import { redirect } from "next/navigation";
import { requireUser } from "@/lib/org";

export default async function Home() {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase
    .from("memberships")
    .select("organizations(slug)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  const org = data?.[0]?.organizations as unknown as { slug: string } | null;
  redirect(org ? `/o/${org.slug}` : "/onboarding");
}
