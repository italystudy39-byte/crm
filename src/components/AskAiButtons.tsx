"use client";

import { askAi, Sparkle } from "./AiChat";

export function DealAiButtons({ dealId, dealTitle }: { dealId: string; dealTitle: string }) {
  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={btn}
        onClick={() => askAi({ dealId, dealTitle, prompt: "Сгенерируй краткую сводку переговоров по этой сделке: что обсуждали, на чём остановились, договорённости и риски." })}
      >
        <Sparkle size={14} /> Сгенерировать сводку переговоров
      </button>
      <button
        className={btn}
        onClick={() => askAi({ dealId, dealTitle, prompt: "Предложи следующее действие по этой сделке с конкретным сроком. Если оно уместно, предложи создать задачу." })}
      >
        <Sparkle size={14} /> Предложить следующее действие
      </button>
    </div>
  );
}
