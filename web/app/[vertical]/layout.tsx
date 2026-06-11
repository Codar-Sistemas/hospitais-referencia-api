import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import EmergencyBanner from '@/components/EmergencyBanner';
import Navbar from '@/components/Navbar';
import { API_URL, SITE_URL } from '@/lib/site';
import { getVertical, LIVE_VERTICALS, type Vertical } from '@/lib/verticals';

// Unknown or not-yet-live slugs 404 instead of rendering on demand.
export const dynamicParams = false;

export function generateStaticParams() {
  return LIVE_VERTICALS.map((v) => ({ vertical: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string }>;
}): Promise<Metadata> {
  const { vertical } = await params;
  const v = getVertical(vertical);
  if (!v) return {};
  return {
    // `absolute` opts out of the root `%s | MapaSUS` template so the carefully
    // length-tuned per-vertical title (≈55 chars) isn't pushed past the SEO
    // sweet spot. The MapaSUS brand already lives inside the title/JSON-LD.
    title: { absolute: v.metadata.title },
    description: v.metadata.description,
    keywords: v.metadata.keywords,
    alternates: { canonical: `/${v.slug}` },
    openGraph: {
      title: v.metadata.title,
      description: v.metadata.description,
      url: `/${v.slug}`,
      siteName: 'MapaSUS',
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: v.metadata.title,
      description: v.metadata.description,
    },
  };
}

// Schema.org graph, parameterized per vertical — gives classic and AI search
// engines (ChatGPT, Gemini, Perplexity) rich, citable context:
// Organization (maintainer) · WebSite (+ SearchAction) · WebApplication · Dataset.
function buildVerticalJsonLd(v: Vertical) {
  const verticalUrl = `${SITE_URL}/${v.slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#organization`,
        name: 'Codar Sistemas',
        url: 'https://codarsistemas.com.br',
        sameAs: ['https://github.com/Codar-Sistemas'],
      },
      {
        '@type': 'WebSite',
        '@id': `${verticalUrl}#website`,
        name: `MapaSUS — ${v.label}`,
        description: v.metadata.description,
        url: verticalUrl,
        inLanguage: 'pt-BR',
        publisher: { '@id': `${SITE_URL}#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${verticalUrl}/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': `${verticalUrl}#webapp`,
        name: `MapaSUS — ${v.label}`,
        description: v.metadata.description,
        url: verticalUrl,
        applicationCategory: 'HealthApplication',
        operatingSystem: 'Any',
        inLanguage: 'pt-BR',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        publisher: { '@id': `${SITE_URL}#organization` },
      },
      {
        '@type': 'Dataset',
        '@id': `${verticalUrl}#dataset`,
        name: `Estabelecimentos de referência do SUS — ${v.label}`,
        description: v.metadata.description,
        url: verticalUrl,
        license: 'https://opendatacommons.org/licenses/odbl/',
        isAccessibleForFree: true,
        keywords: v.metadata.keywords,
        creator: { '@id': `${SITE_URL}#organization` },
        sourceOrganization: {
          '@type': 'GovernmentOrganization',
          name: 'Ministério da Saúde do Brasil',
          url: 'https://www.gov.br/saude',
        },
        distribution: [
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: `${API_URL}/v1/${v.slug}/hospitals`,
          },
          {
            '@type': 'DataDownload',
            encodingFormat: 'application/json',
            contentUrl: `${API_URL}/v1/${v.slug}/states`,
          },
        ],
      },
    ],
  };
}

export default async function VerticalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const v = getVertical(vertical);
  // Backstop — `dynamicParams = false` already 404s unknown slugs before render.
  if (!v) notFound();

  const jsonLd = buildVerticalJsonLd(v);

  return (
    <div data-theme={v.theme} className="flex flex-col flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar vertical={v.slug} label={v.label} />
      <EmergencyBanner />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <Link href="/" className="flex items-center gap-2 hover:text-slate-600 transition-colors">
            <div className="w-6 h-6 bg-accent-600 rounded flex items-center justify-center text-white text-xs font-bold">
              +
            </div>
            <span className="font-medium text-slate-500">MapaSUS · {v.label}</span>
          </Link>
          <p className="text-center">
            Dados:{' '}
            <a
              href={v.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-600 hover:underline"
            >
              Ministério da Saúde
            </a>{' '}
            · Atualização automática diária
          </p>
          <div className="flex items-center gap-4">
            <Link href="/termos" className="hover:text-slate-600 transition-colors">
              Termos de uso
            </Link>
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
    </div>
  );
}
