import { redirect } from "next/navigation";
import { requireUser } from "@/lib/org";
import { signOut } from "../login/actions";

function slugify(s: string) {
  const map: Record<string, string> = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya" };
  return s.toLowerCase().split("").map((c) => map[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

async function createOrg(formData: FormData) {
  "use server";
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/onboarding?error=1");
  const base = slugify(name);
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.rpc("create_organization", { org_name: name, org_slug: slug });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  redirect(`/o/${slug}`);
}

export default async function Onboarding({ searchParams }: PageProps<"/onboarding">) {
  const sp = await searchParams;
  await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4 p-6">
        <h1 className="text-xl font-semibold">Создайте рабочее пространство</h1>
        <p className="text-sm text-slate-500">
          Это ваша компания в CRM. Позже вы сможете пригласить сотрудников и настроить воронки под свой бизнес.
        </p>
        {sp.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">Не удалось создать: {String(sp.error)}</p>}
        <form action={createOrg} className="space-y-3">
          <div>
            <label className="label">Название компании</label>
            <input name="name" className="input" placeholder="Например, Салон «Лаванда»" required />
          </div>
          <button className="btn w-full">Создать</button>
        </form>
        <form action={signOut}><button className="w-full text-sm text-slate-500 hover:underline">Выйти</button></form>
      </div>
    </main>
  );
}
