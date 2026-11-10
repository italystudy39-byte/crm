"use client";

import { useSyncExternalStore } from "react";

type Mode = "light" | "dark" | "system";
import { THEME_KEY as KEY } from "@/lib/theme";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => { if (read() === "system") applyTheme("system"); };
  mq.addEventListener("change", onSystem);
  return () => { listeners.delete(cb); mq.removeEventListener("change", onSystem); };
}

function setMode(mode: Mode) {
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
  applyTheme(mode);
  listeners.forEach((l) => l());
}

const OPTIONS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: "light", label: "Светлая", icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { mode: "dark", label: "Тёмная", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> },
  { mode: "system", label: "Как в системе", icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
];

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  return (
    <div className="flex rounded-lg border border-slate-300 bg-surface p-0.5" role="radiogroup" aria-label="Тема">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          role="radio"
          aria-checked={mode === o.mode}
          title={o.label}
          onClick={() => setMode(o.mode)}
          className={`flex h-7 w-7 items-center justify-center rounded-md ${mode === o.mode ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100"}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{o.icon}</svg>
        </button>
      ))}
    </div>
  );
}

