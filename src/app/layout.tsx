import type { Metadata } from "next";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "CRM",
  description: "CRM для вашего бизнеса",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
