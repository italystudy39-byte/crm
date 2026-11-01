import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "manager" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Владелец",
  admin: "Администратор",
  manager: "Менеджер",
  viewer: "Только просмотр",
};

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub as string, email: data.claims.email as string };
}

/** Loads the organization by slug. RLS guarantees the user is a member. */
export async function requireOrg(slug: string) {
  const { supabase, userId, email } = await requireUser();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, currency, plan")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();
  const { data: m } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", userId)
    .single();
  const role = (m?.role ?? "viewer") as Role;
  return {
    supabase,
    userId,
    email,
    org,
    role,
    canEdit: role !== "viewer",
    isAdmin: role === "owner" || role === "admin",
  };
}

export function formatMoney(amount: number | string, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

export function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export type FieldDef = {
  id: string;
  entity: "contact" | "company" | "deal";
  key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "boolean";
  options: string[];
};

export function readCustom(formData: FormData, defs: FieldDef[]) {
  const custom: Record<string, unknown> = {};
  for (const d of defs) {
    const raw = formData.get(`custom_${d.key}`);
    if (d.field_type === "boolean") custom[d.key] = raw === "on";
    else if (raw !== null && String(raw) !== "")
      custom[d.key] = d.field_type === "number" ? Number(raw) : String(raw);
  }
  return custom;
}

export function isOverdue(due: string | null, done: boolean) {
  return !done && !!due && new Date(due).getTime() < Date.now();
}
