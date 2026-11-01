import Link from "next/link";
export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-sm space-y-3 text-center">
      <h1 className="text-lg font-semibold">Не найдено</h1>
      <p className="text-sm text-slate-500">Страница не существует или у вас нет доступа.</p>
      <Link href="/" className="btn">На главную</Link>
    </div>
  );
}
