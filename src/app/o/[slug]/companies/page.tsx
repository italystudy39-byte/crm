import { requireOrg, type FieldDef } from "@/lib/org";
import { CustomFieldInputs } from "@/components/CustomFields";
import { saveCompany, deleteCompany } from "../actions";

export default async function CompaniesPage({ params, searchParams }: PageProps<"/o/[slug]/companies">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { supabase, org, canEdit } = await requireOrg(slug);
  const [{ data: companies }, { data: defs }, { data: counts }] = await Promise.all([
    supabase.from("companies").select("id, name, website, phone").eq("organization_id", org.id).order("name"),
    supabase.from("custom_field_defs").select("*").eq("organization_id", org.id).eq("entity", "company").order("position"),
    supabase.from("contacts").select("company_id").eq("organization_id", org.id).not("company_id", "is", null),
  ]);
  const n = new Map<string, number>();
  for (const c of counts ?? []) n.set(c.company_id!, (n.get(c.company_id!) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Компании</h1>
      {canEdit && (
        <details className="card" open={sp.new === "1"}>
          <summary className="cursor-pointer text-sm font-medium text-indigo-600">+ Новая компания</summary>
          <form action={saveCompany} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="slug" value={slug} />
            <div><label className="label">Название</label><input name="name" className="input" required /></div>
            <div><label className="label">Сайт</label><input name="website" className="input" /></div>
            <div><label className="label">Телефон</label><input name="phone" className="input" /></div>
            <CustomFieldInputs defs={(defs ?? []) as FieldDef[]} />
            <div className="flex items-end"><button className="btn">Создать</button></div>
          </form>
        </details>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Название</th><th className="th">Сайт</th><th className="th">Телефон</th><th className="th">Контактов</th><th className="th" /></tr></thead>
          <tbody>
            {(companies ?? []).map((c) => (
              <tr key={c.id} id={c.id} className="target:bg-indigo-50">
                <td className="td font-medium">{c.name}</td>
                <td className="td">{c.website}</td>
                <td className="td">{c.phone}</td>
                <td className="td">{n.get(c.id) ?? 0}</td>
                <td className="td text-right">
                  {canEdit && (
                    <form action={deleteCompany}>
                      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={c.id} />
                      <button className="btn-danger">Удалить</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(companies ?? []).length === 0 && <tr><td className="td text-slate-500" colSpan={5}>Компаний пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
