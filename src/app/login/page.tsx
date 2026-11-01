import Link from "next/link";
import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const signup = sp.mode === "signup";
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  const message = typeof sp.message === "string" ? sp.message : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">{signup ? "Регистрация" : "Вход в CRM"}</h1>
          <p className="text-sm text-slate-500">
            {signup ? "Создайте аккаунт, затем — рабочее пространство для вашего бизнеса" : "Войдите в свой аккаунт"}
          </p>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-700">{message}</p>}
        <form action={signup ? signUp : signIn} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {signup && (
            <div>
              <label className="label">Имя</label>
              <input name="full_name" className="input" required />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" required autoComplete="email" />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input name="password" type="password" minLength={6} className="input" required />
          </div>
          <button className="btn w-full">{signup ? "Зарегистрироваться" : "Войти"}</button>
        </form>
        <p className="text-center text-sm text-slate-500">
          {signup ? (
            <>Уже есть аккаунт? <Link className="text-indigo-600" href={`/login?next=${encodeURIComponent(next)}`}>Войти</Link></>
          ) : (
            <>Нет аккаунта? <Link className="text-indigo-600" href={`/login?mode=signup&next=${encodeURIComponent(next)}`}>Зарегистрироваться</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
