import type { Metadata } from 'next';
import Link from 'next/link';
import HubSearch from '@/components/hub/HubSearch';
import { VERTICALS, type VerticalTheme } from '@/lib/verticals';

export const metadata: Metadata = {
  title: 'MapaSUS — Estabelecimentos de Referência do SUS',
  description:
    'Plataforma pública e gratuita que organiza e republica os dados oficiais do Ministério da Saúde sobre os estabelecimentos habilitados pelo SUS: animais peçonhentos, doenças raras e oncologia.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'MapaSUS — Estabelecimentos de Referência do SUS',
    description:
      'Dados oficiais do Ministério da Saúde sobre estabelecimentos habilitados pelo SUS, organizados, normalizados e fáceis de buscar.',
    url: '/',
    siteName: 'MapaSUS',
    locale: 'pt_BR',
    type: 'website',
  },
};

// Per-theme accent classes. Full CSS-variable theming is a follow-up; for now
// each vertical card carries its own static accent.
const ACCENT: Record<VerticalTheme, { dot: string; ring: string; text: string; hover: string }> = {
  venom: {
    dot: 'bg-emerald-500',
    ring: 'hover:border-emerald-300 hover:ring-emerald-100',
    text: 'text-emerald-700',
    hover: 'group-hover:text-emerald-600',
  },
  rare: {
    dot: 'bg-violet-500',
    ring: 'hover:border-violet-300 hover:ring-violet-100',
    text: 'text-violet-700',
    hover: 'group-hover:text-violet-600',
  },
  oncology: {
    dot: 'bg-sky-500',
    ring: 'hover:border-sky-300 hover:ring-sky-100',
    text: 'text-sky-700',
    hover: 'group-hover:text-sky-600',
  },
};

const SITE_URL = 'https://hospitais-referencia-web.vercel.app';

const hubJsonLd = {
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
      '@id': `${SITE_URL}#website`,
      name: 'MapaSUS',
      description:
        'Plataforma pública que organiza e republica os dados oficiais do Ministério da Saúde sobre os estabelecimentos habilitados pelo SUS.',
      url: SITE_URL,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${SITE_URL}#organization` },
    },
  ],
};

export default function Hub() {
  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
              +
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">MapaSUS</span>
          </div>
          <a
            href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-3 py-1 rounded-full mb-5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Iniciativa cidadã independente · Dados do Ministério da Saúde
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 leading-tight tracking-tight">
            Os estabelecimentos de referência do <span className="text-emerald-600">SUS</span>,
            fáceis de encontrar
          </h1>
          <p className="mt-5 text-slate-500 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            O Ministério da Saúde publica as listas de hospitais habilitados por programa em PDFs e
            planilhas dispersos. O MapaSUS organiza, normaliza e republica esses dados com busca por
            cidade, CEP e proximidade — atualizados automaticamente todos os dias.
          </p>
          <HubSearch />
        </div>
      </section>

      {/* Vertical cards */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 w-full">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-5">
          Escolha uma área
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v) => {
            const accent = ACCENT[v.theme];
            const isLive = v.status === 'live';
            const inner = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${accent.dot}`} />
                  {isLive ? (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">
                      No ar
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 ring-1 ring-slate-200 px-2 py-0.5 rounded-full">
                      Em breve
                    </span>
                  )}
                </div>
                <h3
                  className={`text-lg font-bold text-slate-900 ${isLive ? accent.hover : ''} transition-colors`}
                >
                  {v.label}
                </h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{v.cardDescription}</p>
                {isLive && (
                  <span
                    className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${accent.text}`}
                  >
                    Buscar hospitais →
                  </span>
                )}
              </>
            );
            return isLive ? (
              <Link
                key={v.slug}
                href={`/${v.slug}`}
                className={`group block bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-transparent transition-all ${accent.ring}`}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={v.slug}
                className="block bg-white rounded-2xl border border-slate-200 p-6 shadow-sm opacity-75"
                aria-disabled="true"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* About + disclaimer */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 w-full">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2">O que é o MapaSUS</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Uma plataforma pública e gratuita que reúne, numa interface única e numa API REST
            aberta, os estabelecimentos habilitados pelo SUS para diferentes programas de
            atendimento. Nenhum dado é inventado ou modificado — apenas normalizado e estruturado a
            partir das publicações oficiais do Ministério da Saúde.
          </p>
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">
            O MapaSUS é uma iniciativa cidadã independente, mantida pela{' '}
            <a href="https://codarsistemas.com.br" className="text-emerald-600 hover:underline">
              Codar Sistemas
            </a>
            . Não tem vínculo institucional com o Ministério da Saúde do Brasil. Em caso de
            emergência, ligue para o SAMU (192).
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-600 rounded flex items-center justify-center text-white text-xs font-bold">
              +
            </div>
            <span className="font-medium text-slate-500">MapaSUS</span>
          </div>
          <p className="text-center">Dados: Ministério da Saúde · Atualização automática diária</p>
          <div className="flex items-center gap-4">
            <Link href="/termos" className="hover:text-slate-600 transition-colors">
              Termos de uso
            </Link>
            <Link href="/docs" className="hover:text-slate-600 transition-colors">
              API
            </Link>
          </div>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJsonLd) }}
      />
    </div>
  );
}
