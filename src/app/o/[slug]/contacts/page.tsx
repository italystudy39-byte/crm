import Link from "next/link";
import { requireOrg, type FieldDef } from "@/lib/org";
import { CustomFieldInputs } from "@/components/CustomFields";
import { CsvImport } from "@/components/CsvImport";
import { saveContact } from "../actions";

export default async function ContactsPage({ params, searchParams }: PageProps<"/o/[slug]/contacts">) {
  const { slug } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const { supabase, org, canEdit } = await requireOrg(slug);

  let query = supabase.from("contacts").select("id, first_name, last_name, email, phone, companies(name)").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(200);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const [{ data: contacts }, { data: companies }, { data: defs }] = await Promise.all([
    query,
    supabase.from("companies").select("id, name").eq("organization_id", org.id).order("name").limit(500),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).eq("entity", "contact").order("position"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Контакты</h1>
        {canEdit && <CsvImport slug={slug} />}
      </div>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} className="input max-w-sm" placeholder="Поиск по имени, email, телефону" />
        <button className="btn-ghost">Найти</button>
      </form>
      {canEdit && (
        <details className="card" open={sp.new === "1"}>
          <summary className="cursor-pointer text-sm font-medium text-indigo-600">+ Новый контакт</summary>
          <form action={saveContact} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="slug" value={slug} />
            <div><label className="label">Имя</label><input name="first_name" className="input" required /></div>
            <div><label className="label">Фамилия</label><input name="last_name" className="input" /></div>
            <div><label className="label">Телефон</label><input name="phone" className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
            <div><label className="label">Компания</label>
              <select name="company_id" className="input"><option value="">—</option>{(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <CustomFieldInputs defs={(defs ?? []) as FieldDef[]} />
            <div className="flex items-end"><button className="btn">Создать</button></div>
          </form>
        </details>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Имя</th><th className="th">Телефон</th><th className="th">Email</th><th className="th">Компания</th></tr></thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td"><Link className="font-medium text-indigo-600" href={`/o/${slug}/contacts/${c.id}`}>{c.first_name} {c.last_name}</Link></td>
                <td className="td">{c.phone}</td>
                <td className="td">{c.email}</td>
                <td className="td">{(c.companies as unknown as { name: string } | null)?.name}</td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && <tr><td className="td text-slate-500" colSpan={4}>{q ? "Ничего не найдено" : "Контактов пока нет"}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
