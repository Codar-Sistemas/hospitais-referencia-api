'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import SearchTabs from '@/components/search/SearchTabs';
import SearchByAnimal from '@/components/search/SearchByAnimal';
import SearchByPostalCode from '@/components/search/SearchByPostalCode';
import SearchByCity from '@/components/search/SearchByCity';
import HospitalList from '@/components/hospital/HospitalList';
import { useHospitalSearch } from '@/hooks/useHospitalSearch';
import { getVertical } from '@/lib/verticals';
import type { SearchMode } from '@/lib/types';

// NOTE: the hero reads from the registry, but the "Como funciona" + FAQ blocks
// below are still venomous-animals-specific. They only render for the single
// live vertical today; per-vertical FAQ content is a follow-up for when a
// second vertical goes live.
export default function VerticalHome({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params);
  // The layout already validated the slug (dynamicParams=false + notFound).
  const v = getVertical(vertical)!;

  const [mode, setMode] = useState<SearchMode>('city');
  const [stateCode, setStateCode] = useState('');
  const [treatment, setTreatment] = useState('');
  const [city, setCity] = useState('');
  const [cep, setCep] = useState('');

  const { hospitals, error, searched, isPending, search } = useHospitalSearch(v.slug);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search({ mode, stateCode, city, cep, treatment: treatment || undefined });
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-3 py-1 rounded-full mb-5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            {v.hero.eyebrow}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
            {v.hero.titleLead} <br />
            <span className="text-emerald-600">{v.hero.titleAccent}</span>
          </h1>
          <p className="mt-4 text-slate-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            {v.hero.subtitle}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-full">
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Em emergência, ligue para o SAMU: 192
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <SearchTabs mode={mode} onChange={setMode} />

          <form onSubmit={handleSearch} className="p-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mode === 'animal' && (
                <SearchByAnimal
                  stateCode={stateCode}
                  treatment={treatment}
                  onStateCodeChange={setStateCode}
                  onTreatmentChange={setTreatment}
                />
              )}
              {mode === 'cep' && (
                <SearchByPostalCode
                  cep={cep}
                  treatment={treatment}
                  onCepChange={setCep}
                  onTreatmentChange={setTreatment}
                />
              )}
              {mode === 'city' && (
                <SearchByCity
                  city={city}
                  stateCode={stateCode}
                  treatment={treatment}
                  onCityChange={setCity}
                  onStateCodeChange={setStateCode}
                  onTreatmentChange={setTreatment}
                />
              )}
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <svg
                  className="w-4 h-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm text-sm"
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Buscando...
                </span>
              ) : (
                'Buscar hospitais'
              )}
            </button>
          </form>
        </div>

        {searched && <HospitalList hospitals={hospitals} />}
      </div>

      {/* ----------------------------------------------------------------
          Below-the-fold SEO content. Server-rendered (despite the parent
          being a Client Component) so crawlers see real H2/H3 hierarchy,
          and AI engines pick up the FAQPage schema.
          ---------------------------------------------------------------- */}
      <section aria-labelledby="como-funciona" className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
        <h2 id="como-funciona" className="text-2xl font-bold text-slate-900 mb-6">
          Como funciona
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <article className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-2">1. Dados oficiais</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Os PDFs publicados pelo Ministério da Saúde para cada estado são monitorados todos os
              dias. Quando um arquivo muda, a base é atualizada automaticamente.
            </p>
          </article>
          <article className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-2">2. Busca inteligente</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Localize a unidade de referência mais próxima por cidade, CEP ou tipo de animal.
              Resultados ordenados por distância quando coordenadas estão disponíveis.
            </p>
          </article>
          <article className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-2">3. Pronto para emergência</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cada hospital traz telefone, endereço, CNES e a lista exata de soros disponíveis
              (botrópico, crotálico, elapídico, escorpiônico e outros).
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="faq" className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <h2 id="faq" className="text-2xl font-bold text-slate-900 mb-6">
          Perguntas frequentes
        </h2>
        <div className="space-y-4">
          <details className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <summary className="font-semibold text-slate-900 cursor-pointer">
              O que são animais peçonhentos?
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Animais peçonhentos são aqueles que produzem veneno e possuem um mecanismo para
              inoculá-lo, como cobras (jararaca, cascavel, coral, surucucu), escorpiões, aranhas
              (armadeira, marrom) e lagartas (Lonomia). No Brasil, acidentes com esses animais são
              tratados como urgência médica no SUS.
            </p>
          </details>
          <details className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <summary className="font-semibold text-slate-900 cursor-pointer">
              O que devo fazer em caso de acidente?
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Ligue imediatamente para o SAMU (192). Mantenha a pessoa acidentada calma e em
              repouso, com o membro afetado elevado se possível. Não faça torniquete, não corte a
              região, não chupe o veneno. Lave o local com água e sabão e procure o hospital de
              referência mais próximo — esta ferramenta ajuda você a identificá-lo.
            </p>
          </details>
          <details className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <summary className="font-semibold text-slate-900 cursor-pointer">
              De onde vêm os dados?
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Os dados vêm dos PDFs oficiais publicados pelo Ministério da Saúde em{' '}
              <a
                href="https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:underline"
              >
                gov.br/saude
              </a>
              . Eles são lidos automaticamente todos os dias e estruturados para facilitar a busca.
              Nenhum dado é inventado — apenas normalizado.
            </p>
          </details>
          <details className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <summary className="font-semibold text-slate-900 cursor-pointer">
              Quais tipos de soro existem?
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Os principais são: soro antibotrópico (jararaca, urutu), soro anticrotálico
              (cascavel), soro antielapídico (coral-verdadeira), soro antilaquético (surucucu), soro
              antiescorpiônico, soro antiloxoscélico (aranha marrom), soro antifoneutrico (aranha
              armadeira) e soro antilonômico (lagarta-de-fogo). Nem todo hospital tem todos os tipos
              — esta ferramenta mostra exatamente quais cada unidade disponibiliza.
            </p>
          </details>
          <details className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <summary className="font-semibold text-slate-900 cursor-pointer">
              A API é gratuita?
            </summary>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Sim. A API REST é pública, gratuita, sem autenticação e documentada em{' '}
              <Link href="/docs" className="text-emerald-600 hover:underline">
                /docs
              </Link>
              . Há rate limit de 15 requisições por minuto por IP para proteger contra abusos. Para
              casos de uso institucional com volume maior,{' '}
              <a
                href="https://github.com/Codar-Sistemas/hospitais-referencia-api/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 hover:underline"
              >
                abra uma issue
              </a>
              .
            </p>
          </details>
        </div>
      </section>

      {/* FAQPage JSON-LD — makes the questions citable by AI engines and
          enables rich snippets in Google search results. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'O que são animais peçonhentos?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Animais peçonhentos são aqueles que produzem veneno e possuem um mecanismo para inoculá-lo, como cobras (jararaca, cascavel, coral, surucucu), escorpiões, aranhas (armadeira, marrom) e lagartas (Lonomia). No Brasil, acidentes com esses animais são tratados como urgência médica no SUS.',
      },
    },
    {
      '@type': 'Question',
      name: 'O que devo fazer em caso de acidente com animal peçonhento?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Ligue imediatamente para o SAMU (192). Mantenha a pessoa acidentada calma e em repouso, com o membro afetado elevado se possível. Não faça torniquete, não corte a região, não chupe o veneno. Lave o local com água e sabão e procure o hospital de referência mais próximo.',
      },
    },
    {
      '@type': 'Question',
      name: 'De onde vêm os dados dos hospitais de referência?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Os dados vêm dos PDFs oficiais publicados pelo Ministério da Saúde do Brasil em gov.br/saude. Eles são lidos automaticamente todos os dias e estruturados para facilitar a busca. Nenhum dado é inventado — apenas normalizado.',
      },
    },
    {
      '@type': 'Question',
      name: 'Quais tipos de soro antiofídico e antiveneno existem?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Os principais são: soro antibotrópico (jararaca, urutu), soro anticrotálico (cascavel), soro antielapídico (coral-verdadeira), soro antilaquético (surucucu), soro antiescorpiônico, soro antiloxoscélico (aranha marrom), soro antifoneutrico (aranha armadeira) e soro antilonômico (lagarta-de-fogo).',
      },
    },
    {
      '@type': 'Question',
      name: 'A API de hospitais de referência é gratuita?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Sim. A API REST é pública, gratuita, sem autenticação e documentada na rota /docs. Há rate limit de 15 requisições por minuto por IP para proteger contra abusos.',
      },
    },
  ],
};
