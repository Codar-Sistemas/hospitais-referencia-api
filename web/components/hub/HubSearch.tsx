'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { searchAcrossVerticals } from '@/lib/api-client';
import { emit } from '@/lib/telemetry';
import type { CrossVerticalHospital } from '@/lib/types';
import { THEME_BADGE_CLASS, VERTICAL_BY_DB_KEY } from '@/lib/verticals';

// Cross-vertical search teaser on the hub: one query (by city) across every
// active vertical, showing which SUS programmes each hospital is habilitado in
// and linking through to each vertical's full search.
export default function HubSearch() {
  const [city, setCity] = useState('');
  const [results, setResults] = useState<CrossVerticalHospital[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) {
      setError('Digite o nome de uma cidade.');
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        const hospitals = await searchAcrossVerticals({ city: trimmed, limit: 100 });
        setResults(hospitals);
        setSearched(true);
        emit({
          event_type: 'search_executed',
          payload: { scope: 'cross_vertical', city: trimmed, results_count: hospitals.length },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar. Tente novamente.');
      }
    });
  }

  return (
    <div className="mt-8 max-w-2xl mx-auto text-left">
      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Busque por cidade — todas as áreas de uma vez"
          aria-label="Cidade"
          className="flex-1 border border-slate-200 bg-white rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm text-sm shrink-0"
        >
          {isPending ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          {error}
        </p>
      )}

      {searched && !error && (
        <div className="mt-5">
          {results.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Nenhum estabelecimento encontrado nessa cidade. Tente outra grafia ou explore as áreas
              acima.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                {results.length}{' '}
                {results.length === 1
                  ? 'estabelecimento encontrado'
                  : 'estabelecimentos encontrados'}
              </p>
              <ul className="space-y-2">
                {results.map((h) => (
                  <li
                    key={h.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                  >
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{h.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {h.city} · {h.state_code}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {h.active_verticals.map((dbKey) => {
                        const vertical = VERTICAL_BY_DB_KEY[dbKey];
                        if (!vertical) return null;
                        return (
                          <Link
                            key={dbKey}
                            href={`/${vertical.slug}`}
                            className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition-opacity hover:opacity-80 ${THEME_BADGE_CLASS[vertical.theme]}`}
                          >
                            {vertical.label} →
                          </Link>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
