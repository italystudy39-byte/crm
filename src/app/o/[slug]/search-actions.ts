"use server";

import { requireOrg } from "@/lib/org";

export type SearchHit = { kind: "deal" | "contact" | "company"; id: string; title: string; subtitle: string; href: string };

export async function globalSearch(slug: string, q: string): Promise<SearchHit[]> {
  const term = q.trim().replace(/[%,()*\\]/g, " ").slice(0, 80);
  if (term.length < 2) return [];
  const { supabase, org } = await requireOrg(slug);
  const like = `%${term}%`;
  const [deals, contacts, companies] = await Promise.all([
    supabase.from("deals").select("id, title, amount, stages(name)").eq("organization_id", org.id).ilike("title", like).limit(6),
    supabase.from("contacts").select("id, first_name, last_name, phone, email").eq("organization_id", org.id)
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(6),
    supabase.from("companies").select("id, name, website").eq("organization_id", org.id).ilike("name", like).limit(6),
  ]);
  const base = `/o/${slug}`;
  return [
    ...(deals.data ?? []).map((d) => ({
      kind: "deal" as const, id: d.id, title: d.title,
      subtitle: `${(d.stages as unknown as { name: string } | null)?.name ?? ""} · ${new Intl.NumberFormat("ru-RU").format(Number(d.amount))} ${org.currency}`,
      href: `${base}/deals/${d.id}`,
    })),
    ...(contacts.data ?? []).map((c) => ({
      kind: "contact" as const, id: c.id, title: `${c.first_name} ${c.last_name ?? ""}`.trim(),
      subtitle: [c.phone, c.email].filter(Boolean).join(" · "), href: `${base}/contacts/${c.id}`,
    })),
    ...(companies.data ?? []).map((c) => ({
      kind: "company" as const, id: c.id, title: c.name, subtitle: c.website ?? "", href: `${base}/companies#${c.id}`,
    })),
  ];
}
