import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import PostHogScript from '@/components/PostHogScript';
import { SITE_URL } from '@/lib/site';

const geist = Geist({ subsets: ['latin'] });

// Platform-level (MapaSUS) defaults. Per-vertical SEO (title/description/
// canonical/OpenGraph) and the Schema.org graph live in app/[vertical]/layout.tsx;
// the hub provides its own metadata in app/page.tsx. `metadataBase` lets the
// per-vertical relative `canonical` / `openGraph.url` resolve to absolute URLs.
const PLATFORM_DESCRIPTION =
  'Plataforma pública e gratuita que organiza e republica os dados oficiais do Ministério da Saúde sobre os estabelecimentos habilitados pelo SUS.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'MapaSUS — Estabelecimentos de Referência do SUS',
    template: '%s | MapaSUS',
  },
  description: PLATFORM_DESCRIPTION,
  authors: [{ name: 'Codar Sistemas', url: 'https://github.com/Codar-Sistemas' }],
  openGraph: {
    siteName: 'MapaSUS',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geist.className} min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased`}
      >
        <PostHogScript />
        {children}
      </body>
    </html>
  );
}
