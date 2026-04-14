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
    <html lang="pt-BR" className="h-full">
      <body className={`${geist.className} min-h-full flex flex-col bg-gray-50 text-gray-900 antialiased`}>
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-400">
          Dados:{" "}
          <a
            href="https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-green-700"
          >
            Ministério da Saúde
          </a>{" "}
          · Atualização automática diária · Código:{" "}
          <a
            href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-green-700"
          >
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
