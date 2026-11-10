"use client";

import { askAi, Sparkle } from "./AiChat";

export function ContactSupportButton() {
  return (
    <button className="btn inline-flex items-center gap-1.5" onClick={() => askAi({ prompt: "Мне нужна помощь специалиста поддержки." })}>
      <Sparkle size={14} /> Спросить AI-ассистента
    </button>
  );
}
