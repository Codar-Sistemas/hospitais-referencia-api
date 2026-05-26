import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import PostHogScript from "@/components/PostHogScript";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://hospitais-referencia-web.vercel.app"),
  title: "Hospitais de Referência | Animais Peçonhentos",
  description:
    "Localize hospitais de referência com soro antiofídico e antiveneno para tratamento de acidentes com animais peçonhentos no Brasil. Dados oficiais do Ministério da Saúde.",
  keywords: [
    "soro antiofídico",
    "antiveneno",
    "animais peçonhentos",
    "cobra",
    "escorpião",
    "aranha",
    "hospital de referência",
    "ministério da saúde",
    "emergência",
  ],
  authors: [{ name: "Codar Sistemas", url: "https://github.com/Codar-Sistemas" }],
  openGraph: {
    title: "Hospitais de Referência | Animais Peçonhentos",
    description:
      "Localize hospitais de referência com soro antiofídico e antiveneno para tratamento de acidentes com animais peçonhentos no Brasil. Dados oficiais do Ministério da Saúde.",
    url: "https://hospitais-referencia-web.vercel.app",
    siteName: "Hospitais de Referência",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hospitais de Referência | Animais Peçonhentos",
    description:
      "Localize hospitais de referência com soro antiofídico e antiveneno para tratamento de acidentes com animais peçonhentos no Brasil.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Schema.org graph with multiple typed nodes — gives both classic search
// engines and AI engines (ChatGPT, Gemini, Perplexity) rich context:
// - Organization → who maintains the project
// - WebSite     → the site itself + SearchAction (Google sitelinks searchbox)
// - WebApplication → the public-facing app
// - Dataset     → flags the API/data as a citable public dataset (boosts AI visibility)
const SITE_URL = "https://hospitais-referencia-web.vercel.app";
const API_URL = "https://hospitais-referencia-api.vercel.app";
const DESCRIPTION =
  "Localize hospitais de referência com soro antiofídico e antiveneno para tratamento de acidentes com animais peçonhentos no Brasil. Dados oficiais do Ministério da Saúde.";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "Codar Sistemas",
      url: "https://codarsistemas.com.br",
      sameAs: ["https://github.com/Codar-Sistemas"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: "Hospitais de Referência",
      description: DESCRIPTION,
      url: SITE_URL,
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}#webapp`,
      name: "Hospitais de Referência",
      description: DESCRIPTION,
      url: SITE_URL,
      applicationCategory: "HealthApplication",
      operatingSystem: "Any",
      inLanguage: "pt-BR",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
      publisher: { "@id": `${SITE_URL}#organization` },
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}#dataset`,
      name: "Hospitais de Referência para Animais Peçonhentos no Brasil",
      description:
        "Diretório atualizado diariamente dos hospitais brasileiros habilitados a tratar acidentes com animais peçonhentos (cobras, escorpiões, aranhas, lagartas), agregando os PDFs oficiais do Ministério da Saúde em uma API REST pública.",
      url: SITE_URL,
      license: "https://opendatacommons.org/licenses/odbl/",
      isAccessibleForFree: true,
      keywords: [
        "soro antiofídico",
        "antiveneno",
        "animais peçonhentos",
        "hospitais",
        "Brasil",
        "Ministério da Saúde",
        "SUS",
        "emergência",
        "envenenamento",
      ],
      creator: { "@id": `${SITE_URL}#organization` },
      sourceOrganization: {
        "@type": "GovernmentOrganization",
        name: "Ministério da Saúde do Brasil",
        url: "https://www.gov.br/saude",
      },
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${API_URL}/v1/hospitals`,
        },
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: `${API_URL}/v1/states`,
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.className} min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <PostHogScript />
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
