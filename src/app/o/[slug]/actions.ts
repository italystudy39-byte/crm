"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg, readCustom, type FieldDef, type Role } from "@/lib/org";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return v === null || String(v).trim() === "" ? null : String(v).trim();
};

async function ctx(f: FormData) {
  const slug = String(f.get("slug"));
  const c = await requireOrg(slug);
  return { ...c, slug };
}

async function defsFor(c: Awaited<ReturnType<typeof ctx>>, entity: FieldDef["entity"]) {
  const { data } = await c.supabase.from("custom_field_defs").select("*").eq("organization_id", c.org.id).eq("entity", entity);
  return (data ?? []) as FieldDef[];
}

function fail(msg: string): never {
  throw new Error(msg);
}

// ---------- contacts ----------
export async function saveContact(f: FormData) {
  const c = await ctx(f);
  const id = s(f, "id");
  const row = {
    organization_id: c.org.id,
    first_name: s(f, "first_name") ?? fail("Укажите имя"),
    last_name: s(f, "last_name"),
    email: s(f, "email"),
    phone: s(f, "phone"),
    company_id: s(f, "company_id"),
    custom: readCustom(f, await defsFor(c, "contact")),
  };
  if (id) {
    const { error } = await c.supabase.from("contacts").update(row).eq("id", id);
    if (error) fail(error.message);
    revalidatePath(`/o/${c.slug}/contacts/${id}`);
  } else {
    const { data, error } = await c.supabase.from("contacts").insert({ ...row, owner_id: c.userId }).select("id").single();
    if (error) fail(error.message);
    redirect(`/o/${c.slug}/contacts/${data.id}`);
  }
}

export async function deleteContact(f: FormData) {
  const c = await ctx(f);
  await c.supabase.from("contacts").delete().eq("id", String(f.get("id")));
  redirect(`/o/${c.slug}/contacts`);
}

export async function importContacts(slug: string, rows: { first_name: string; last_name?: string; email?: string; phone?: string }[]) {
  const c = await requireOrg(slug);
  const clean = rows
    .filter((r) => r.first_name?.trim())
    .slice(0, 5000)
    .map((r) => ({
      organization_id: c.org.id,
      owner_id: c.userId,
      first_name: r.first_name.trim(),
      last_name: r.last_name?.trim() || null,
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
    }));
  if (!clean.length) return { inserted: 0, error: "Нет строк с именем" };
  const { error } = await c.supabase.from("contacts").insert(clean);
  revalidatePath(`/o/${slug}/contacts`);
  return { inserted: error ? 0 : clean.length, error: error?.message ?? null };
}

// ---------- companies ----------
export async function saveCompany(f: FormData) {
  const c = await ctx(f);
  const id = s(f, "id");
  const row = {
    organization_id: c.org.id,
    name: s(f, "name") ?? fail("Укажите название"),
    website: s(f, "website"),
    phone: s(f, "phone"),
    custom: readCustom(f, await defsFor(c, "company")),
  };
  if (id) {
    const { error } = await c.supabase.from("companies").update(row).eq("id", id);
    if (error) fail(error.message);
  } else {
    const { error } = await c.supabase.from("companies").insert({ ...row, owner_id: c.userId });
    if (error) fail(error.message);
  }
  revalidatePath(`/o/${c.slug}/companies`);
}

export async function deleteCompany(f: FormData) {
  const c = await ctx(f);
  await c.supabase.from("companies").delete().eq("id", String(f.get("id")));
  revalidatePath(`/o/${c.slug}/companies`);
}

// ---------- deals ----------
export async function saveDeal(f: FormData) {
  const c = await ctx(f);
  const id = s(f, "id");
  const stage_id = s(f, "stage_id") ?? fail("Выберите этап");
  const { data: stage } = await c.supabase.from("stages").select("pipeline_id, kind").eq("id", stage_id).single();
  if (!stage) fail("Этап не найден");
  const row = {
    organization_id: c.org.id,
    title: s(f, "title") ?? fail("Укажите название"),
    amount: Number(s(f, "amount") ?? 0),
    stage_id,
    pipeline_id: stage.pipeline_id,
    contact_id: s(f, "contact_id"),
    company_id: s(f, "company_id"),
    owner_id: s(f, "owner_id") ?? c.userId,
    custom: readCustom(f, await defsFor(c, "deal")),
    closed_at: stage.kind === "open" ? null : new Date().toISOString(),
  };
  if (id) {
    const { error } = await c.supabase.from("deals").update(row).eq("id", id);
    if (error) fail(error.message);
    revalidatePath(`/o/${c.slug}/deals/${id}`);
  } else {
    const { data, error } = await c.supabase.from("deals").insert(row).select("id").single();
    if (error) fail(error.message);
    redirect(`/o/${c.slug}/deals/${data.id}`);
  }
}

export async function moveDeal(slug: string, dealId: string, stageId: string) {
  const c = await requireOrg(slug);
  const [{ data: deal }, { data: stage }] = await Promise.all([
    c.supabase.from("deals").select("stage_id").eq("id", dealId).single(),
    c.supabase.from("stages").select("name, kind, pipeline_id").eq("id", stageId).single(),
  ]);
  if (!deal || !stage || deal.stage_id === stageId) return;
  const { error } = await c.supabase
    .from("deals")
    .update({ stage_id: stageId, pipeline_id: stage.pipeline_id, closed_at: stage.kind === "open" ? null : new Date().toISOString() })
    .eq("id", dealId);
  if (error) return { error: error.message };
  await c.supabase.from("activities").insert({
    organization_id: c.org.id, deal_id: dealId, type: "stage_change", body: `Этап: ${stage.name}`, author_id: c.userId,
  });
  revalidatePath(`/o/${slug}/deals`);
}

export async function deleteDeal(f: FormData) {
  const c = await ctx(f);
  await c.supabase.from("deals").delete().eq("id", String(f.get("id")));
  redirect(`/o/${c.slug}/deals`);
}

// ---------- activities & tasks ----------
export async function addActivity(f: FormData) {
  const c = await ctx(f);
  const body = s(f, "body");
  if (!body) return;
  await c.supabase.from("activities").insert({
    organization_id: c.org.id,
    type: (s(f, "type") ?? "note") as string,
    body,
    deal_id: s(f, "deal_id"),
    contact_id: s(f, "contact_id"),
    author_id: c.userId,
  });
  revalidatePath(String(f.get("path")));
}

export async function addTask(f: FormData) {
  const c = await ctx(f);
  const title = s(f, "title");
  if (!title) return;
  const due = s(f, "due_at");
  await c.supabase.from("tasks").insert({
    organization_id: c.org.id,
    title,
    due_at: due ? new Date(due).toISOString() : null,
    deal_id: s(f, "deal_id"),
    contact_id: s(f, "contact_id"),
    assignee_id: s(f, "assignee_id") ?? c.userId,
  });
  revalidatePath(String(f.get("path") ?? `/o/${c.slug}/tasks`));
}

export async function toggleTask(f: FormData) {
  const c = await ctx(f);
  await c.supabase.from("tasks").update({ done: f.get("done") === "true" }).eq("id", String(f.get("id")));
  revalidatePath(String(f.get("path") ?? `/o/${c.slug}/tasks`));
}

// ---------- settings ----------
function requireAdmin(c: { isAdmin: boolean }) {
  if (!c.isAdmin) fail("Нужны права администратора");
}

export async function updateOrg(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  await c.supabase.from("organizations").update({ name: s(f, "name") ?? c.org.name, currency: s(f, "currency") ?? c.org.currency }).eq("id", c.org.id);
  revalidatePath(`/o/${c.slug}`, "layout");
}

export async function inviteMember(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const role = (s(f, "role") ?? "manager") as Role;
  if (role === "owner" && c.role !== "owner") fail("Только владелец может назначать владельцев");
  await c.supabase.from("invitations").insert({ organization_id: c.org.id, email: s(f, "email") ?? fail("Укажите email"), role, invited_by: c.userId });
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function revokeInvite(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  await c.supabase.from("invitations").delete().eq("id", String(f.get("id")));
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function changeRole(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const role = String(f.get("role")) as Role;
  if (role === "owner" && c.role !== "owner") fail("Только владелец может назначать владельцев");
  await c.supabase.from("memberships").update({ role }).eq("organization_id", c.org.id).eq("user_id", String(f.get("user_id")));
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function removeMember(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  await c.supabase.from("memberships").delete().eq("organization_id", c.org.id).eq("user_id", String(f.get("user_id")));
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function saveStage(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const id = s(f, "id");
  const row = {
    name: s(f, "name") ?? fail("Укажите название"),
    color: s(f, "color") ?? "#64748b",
    kind: s(f, "kind") ?? "open",
    position: Number(s(f, "position") ?? 0),
  };
  if (id) await c.supabase.from("stages").update(row).eq("id", id);
  else await c.supabase.from("stages").insert({ ...row, organization_id: c.org.id, pipeline_id: String(f.get("pipeline_id")) });
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function deleteStage(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const { error } = await c.supabase.from("stages").delete().eq("id", String(f.get("id")));
  if (error) redirect(`/o/${c.slug}/settings?error=${encodeURIComponent("Нельзя удалить этап, в котором есть сделки")}`);
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function addPipeline(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const { data } = await c.supabase.from("pipelines").insert({ organization_id: c.org.id, name: s(f, "name") ?? "Новая воронка" }).select("id").single();
  if (data) {
    await c.supabase.from("stages").insert([
      { organization_id: c.org.id, pipeline_id: data.id, name: "Новая", position: 0, color: "#3b82f6", kind: "open" },
      { organization_id: c.org.id, pipeline_id: data.id, name: "Успешно", position: 1, color: "#22c55e", kind: "won" },
      { organization_id: c.org.id, pipeline_id: data.id, name: "Отказ", position: 2, color: "#ef4444", kind: "lost" },
    ]);
  }
  revalidatePath(`/o/${c.slug}`, "layout");
}

export async function addField(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  const label = s(f, "label") ?? fail("Укажите название поля");
  const key = label.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "_").replace(/^_|_$/g, "") + "_" + Math.random().toString(36).slice(2, 5);
  const options = (s(f, "options") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  const { error } = await c.supabase.from("custom_field_defs").insert({
    organization_id: c.org.id, entity: String(f.get("entity")), key, label, field_type: String(f.get("field_type")), options,
  });
  if (error) fail(error.message);
  revalidatePath(`/o/${c.slug}/settings`);
}

export async function deleteField(f: FormData) {
  const c = await ctx(f);
  requireAdmin(c);
  await c.supabase.from("custom_field_defs").delete().eq("id", String(f.get("id")));
  revalidatePath(`/o/${c.slug}/settings`);
}
