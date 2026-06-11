import type { Metadata } from 'next';
import Link from 'next/link';
import EmergencyBanner from '@/components/EmergencyBanner';
import Footer from '@/components/Footer';
import SamuBadge from '@/components/SamuBadge';
import HubSearch from '@/components/hub/HubSearch';
import { SITE_URL } from '@/lib/site';
import { THEME_CARD_ACCENT, VERTICALS } from '@/lib/verticals';

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
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm">
              +
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">MapaSUS</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <nav className="flex items-center gap-0.5 sm:gap-1">
              <Link
                href="/estatisticas"
                className="px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                Estatísticas
              </Link>
              <Link
                href="/docs"
                className="px-2 sm:px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                API
              </Link>
            </nav>
            {/* The SAMU badge keeps priority on small screens; GitHub moves
                behind the md breakpoint (it also lives in the footer). */}
            <SamuBadge />
            <a
              href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </header>

      <EmergencyBanner />

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
          <p className="mt-5 text-slate-600 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            {/* Each highlighted area carries its vertical's theme color
                (emerald/violet/sky) — same palette as the cards below. */}
            Digite sua <strong className="text-slate-800">cidade</strong> e encontre em segundos os
            hospitais habilitados pelo SUS perto de você:{' '}
            <strong className="text-emerald-700">soro antiveneno</strong> para acidentes com cobras,
            escorpiões e aranhas, <strong className="text-violet-700">doenças raras</strong> e{' '}
            <strong className="text-sky-700">oncologia</strong> — com endereço, telefone e mapa.
          </p>
          <p className="mt-3 text-sm text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Numa emergência real, saber para onde ir salva tempo: acione o{' '}
            <a href="tel:192" className="font-semibold text-red-600 hover:underline">
              SAMU (192)
            </a>{' '}
            e use o MapaSUS para localizar a unidade de referência mais próxima. Dentro de cada
            área, busque também por CEP e proximidade. Dados oficiais do Ministério da Saúde,
            atualizados todos os dias.
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
            const accent = THEME_CARD_ACCENT[v.theme];
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
            O MapaSUS é uma iniciativa cidadã independente, desenvolvida e mantida voluntariamente
            pela{' '}
            <a
              href="https://codarsistemas.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-600 hover:underline"
            >
              Codar Sistemas
            </a>
            . Não possui vínculo institucional com o Ministério da Saúde nem com qualquer órgão
            público — é um projeto da sociedade civil que facilita o acesso a informações que já são
            públicas. Em caso de emergência, ligue imediatamente para o{' '}
            <a href="tel:192" className="text-red-600 font-semibold hover:underline">
              SAMU: 192
            </a>
            .
          </p>
        </div>
      </section>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubJsonLd) }}
      />
    </div>
  );
}
