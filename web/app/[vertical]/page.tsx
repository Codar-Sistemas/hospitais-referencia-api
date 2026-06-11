'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import EmergencyNotice from '@/components/EmergencyNotice';
import SearchTabs from '@/components/search/SearchTabs';
import SearchByAnimal from '@/components/search/SearchByAnimal';
import SearchByPostalCode from '@/components/search/SearchByPostalCode';
import SearchByCity from '@/components/search/SearchByCity';
import HospitalList from '@/components/hospital/HospitalList';
import { useHospitalSearch } from '@/hooks/useHospitalSearch';
import { getVertical } from '@/lib/verticals';
import type { SearchMode } from '@/lib/types';

export default function VerticalHome({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params);
  // The layout already validated the slug (dynamicParams=false + notFound).
  const v = getVertical(vertical)!;

  // The "by animal/treatment" tab only exists for verticals with a
  // treatment vocabulary (venomous). Others search by city/CEP alone.
  const hasTreatments = v.treatments.length > 0;
  const modes: ReadonlyArray<SearchMode> = hasTreatments
    ? ['city', 'cep', 'animal']
    : ['city', 'cep'];

  const [mode, setMode] = useState<SearchMode>('city');
  const [stateCode, setStateCode] = useState('');
  const [treatment, setTreatment] = useState('');
  const [disease, setDisease] = useState('');
  const [city, setCity] = useState('');
  const [cep, setCep] = useState('');

  const { hospitals, error, searched, isPending, search } = useHospitalSearch(v.apiSlug);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    search({
      mode,
      stateCode,
      city,
      cep,
      treatment: treatment || undefined,
      disease: disease || undefined,
    });
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: v.faq.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return (
    <div>
      {/* Hero */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-10 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-accent-700 bg-accent-50 ring-1 ring-accent-200 px-3 py-1 rounded-full mb-5">
            <span className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
            {v.hero.eyebrow}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
            {v.hero.titleLead} <br />
            <span className="text-accent-600">{v.hero.titleAccent}</span>
          </h1>
          <p className="mt-4 text-slate-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            {v.hero.subtitle}
          </p>
          {v.hero.emergencyNote && <EmergencyNotice label={v.hero.emergencyNote} />}
        </div>
      </div>

      {/* Search */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <SearchTabs mode={mode} onChange={setMode} modes={modes} />

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
                  showTreatmentFilter={hasTreatments}
                  diseaseOptions={v.diseaseFilterOptions}
                  disease={disease}
                  onDiseaseChange={setDisease}
                  diseaseFilterLabel={v.diseaseFilterLabel}
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
                  showTreatmentFilter={hasTreatments}
                  diseaseOptions={v.diseaseFilterOptions}
                  disease={disease}
                  onDiseaseChange={setDisease}
                  diseaseFilterLabel={v.diseaseFilterLabel}
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
              className="mt-5 w-full bg-accent-600 hover:bg-accent-700 disabled:bg-accent-400 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm text-sm"
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

        {searched && <HospitalList hospitals={hospitals} showTreatments={hasTreatments} />}
      </div>

      {/* ----------------------------------------------------------------
          Below-the-fold SEO content, driven by the vertical registry.
          Server-rendered (despite the parent being a Client Component) so
          crawlers see real H2/H3 hierarchy and the FAQPage schema.
          ---------------------------------------------------------------- */}
      {v.howItWorks.length > 0 && (
        <section aria-labelledby="como-funciona" className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <h2 id="como-funciona" className="text-2xl font-bold text-slate-900 mb-6">
            Como funciona
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {v.howItWorks.map(({ title, body }) => (
              <article
                key={title}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
              >
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {v.faq.length > 0 && (
        <section aria-labelledby="faq" className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <h2 id="faq" className="text-2xl font-bold text-slate-900 mb-6">
            Perguntas frequentes
          </h2>
          <div className="space-y-4">
            {v.faq.map(({ question, answer }) => (
              <details
                key={question}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
              >
                <summary className="font-semibold text-slate-900 cursor-pointer">
                  {question}
                </summary>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{answer}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Documentação completa da API em{' '}
            <Link href="/docs" className="text-accent-600 hover:underline">
              /docs
            </Link>
            .
          </p>
        </section>
      )}

      {/* FAQPage JSON-LD — makes the questions citable by AI engines and
          enables rich snippets in Google search results. */}
      {v.faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
    </div>
  );
}
