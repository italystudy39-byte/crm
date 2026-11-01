"use client";

import { useState, useTransition } from "react";
import { importContacts } from "@/app/o/[slug]/actions";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "имя", "name", "фио", "first name"],
  last_name: ["last_name", "фамилия", "last name", "surname"],
  email: ["email", "e-mail", "почта"],
  phone: ["phone", "телефон", "тел", "mobile"],
};

export function CsvImport({ slug }: { slug: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return setMsg("Файл пустой");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = Object.fromEntries(Object.entries(ALIASES).map(([k, al]) => [k, header.findIndex((h) => al.includes(h))]));
    if (idx.first_name < 0) return setMsg("Нужна колонка «Имя» (или name / first_name)");
    const data = rows.slice(1).map((r) => ({
      first_name: r[idx.first_name] ?? "",
      last_name: idx.last_name >= 0 ? r[idx.last_name] : undefined,
      email: idx.email >= 0 ? r[idx.email] : undefined,
      phone: idx.phone >= 0 ? r[idx.phone] : undefined,
    }));
    start(async () => {
      const res = await importContacts(slug, data);
      setMsg(res.error ? `Ошибка: ${res.error}` : `Импортировано: ${res.inserted}`);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="btn-ghost cursor-pointer">
        {pending ? "Импорт…" : "Импорт CSV"}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {msg && <span className="text-slate-600">{msg}</span>}
    </div>
  );
}
