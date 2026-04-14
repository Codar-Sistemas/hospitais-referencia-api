import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hospitais de Referência | Animais Peçonhentos",
  description:
    "Encontre hospitais com soro antiofídico e antiveneno no Brasil. Dados oficiais do Ministério da Saúde.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.className} min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased`}>
        <Navbar />
        <div className="bg-red-600 text-white text-xs sm:text-sm font-medium text-center px-4 py-2 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span>
            <strong>Emergência? Ligue para o SAMU: 192.</strong>{' '}
            <span className="opacity-90">As informações aqui podem estar desatualizadas — sempre confirme com a unidade antes de se deslocar.</span>
          </span>
        </div>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center text-white text-xs font-bold">+</div>
              <span className="font-medium text-slate-500">Hospitais de Referência</span>
            </div>
            <p className="text-center">
              Dados:{" "}
              <a
                href="https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:underline"
              >
                Ministério da Saúde
              </a>{" "}
              · Atualização automática diária
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/termos"
                className="hover:text-slate-600 transition-colors"
              >
                Termos de uso
              </a>
              <a
                href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-600 transition-colors"
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
