"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/o/${slug}`;
  const items = [
    { href: base, label: "Сводка" },
    { href: `${base}/deals`, label: "Сделки" },
    { href: `${base}/contacts`, label: "Контакты" },
    { href: `${base}/companies`, label: "Компании" },
    { href: `${base}/tasks`, label: "Задачи" },
    { href: `${base}/settings`, label: "Настройки" },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((i) => {
        const active = i.href === base ? path === base : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
