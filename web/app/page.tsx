'use client';
import { useState } from 'react';
import SearchTabs from '@/components/search/SearchTabs';
import SearchByAnimal from '@/components/search/SearchByAnimal';
import SearchByPostalCode from '@/components/search/SearchByPostalCode';
import SearchByCity from '@/components/search/SearchByCity';
import HospitalList from '@/components/hospital/HospitalList';
import { useHospitalSearch } from '@/hooks/useHospitalSearch';
import type { SearchMode } from '@/lib/types';

export default function Home() {
  const [mode, setMode] = useState<SearchMode>('city');
  const [stateCode, setStateCode] = useState('');
  const [treatment, setTreatment] = useState('');
  const [city, setCity] = useState('');
  const [cep, setCep] = useState('');

  const { hospitals, error, searched, isPending, search } = useHospitalSearch();

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
            Dados oficiais do Ministério da Saúde
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight tracking-tight">
            Hospitais com soro antiofídico{" "}
            <br />
            <span className="text-emerald-600">e antiveneno no Brasil</span>
          </h1>
          <p className="mt-4 text-slate-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Encontre a unidade de referência mais próxima em caso de acidente com animais peçonhentos.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-full">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
    </div>
  );
}
