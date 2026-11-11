import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Connect — Sorteio de Comentários",
  description:
    "Sorteios de comentários do Instagram da Super Connect, com coleta via Apify, regras configuráveis e resultado registrado.",
  applicationName: "Super Connect Sorteios",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
