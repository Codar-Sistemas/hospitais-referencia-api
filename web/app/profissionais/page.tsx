'use client';
import { useState, useTransition } from 'react';
import { searchHospitals, searchNearby } from '@/lib/api-client';
import { STATES, TREATMENTS, TREATMENT_TEXT_CLASS } from '@/lib/constants';
import type { Hospital } from '@/lib/types';

// Treatment columns to render in the comparison table. Order mirrors the
// previous PT-labeled list (Antiarachnidic intentionally excluded to keep the
// table narrow, matching the prior UI).
const TABLE_TREATMENTS = TREATMENTS.filter((t) => t.value !== 'Antiarachnidic');

// Generate the short header label by trimming the trailing PT suffix.
function shortTreatmentLabel(label: string): string {
  return label
    .replace('ônico', '')
    .replace('élico', '')
    .replace('tico', '')
    .replace('ico', '');
}

export default function Profissionais() {
  const [stateCode, setStateCode] = useState('');
  const [treatment, setTreatment] = useState('');
  const [city, setCity] = useState('');
  const [cep, setCep] = useState('');
  const [radius, setRadius] = useState('50000');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSearched(false);
    startTransition(async () => {
      try {
        let result: Hospital[] = [];
        if (cep.replace(/\D/g, '').length === 8) {
          const data = await searchNearby({
            cep: cep.replace(/\D/g, ''),
            treatment: treatment || undefined,
            radiusM: parseInt(radius, 10),
            limit: 200,
          });
          result = data.hospitals;
        } else {
          if (!stateCode && !city) {
            setError('Informe estado ou município.');
            return;
          }
          result = await searchHospitals({
            stateCode: stateCode || undefined,
            city: city || undefined,
            treatment: treatment || undefined,
            limit: 500,
          });
        }
        setHospitals(result);
        setSearched(true);
        if (result.length === 0) setError('Nenhum hospital encontrado.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao buscar. Tente novamente.';
        setError(message);
      }
    });
  }

  const inputClass =
    'border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm text-slate-800 placeholder-slate-400';

  const showDistance = hospitals.some((h) => h.distance_km !== undefined);

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Consulta para Profissionais</h1>
        </div>
        <p className="text-slate-500 text-sm">Visão técnica com CNES, grade completa de soros e busca avançada.</p>
      </div>

      {/* Filter form */}
      <form onSubmit={handleSearch} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Estado</label>
            <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} – {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Município</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ex: Campinas"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">CEP</label>
            <input
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Raio{' '}
              <span className="text-slate-400 normal-case font-normal">(só com CEP)</span>
            </label>
            <select
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              disabled={cep.replace(/\D/g, '').length !== 8}
              className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <option value="20000">20 km</option>
              <option value="50000">50 km</option>
              <option value="100000">100 km</option>
              <option value="200000">200 km</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tipo de soro</label>
            <select value={treatment} onChange={(e) => setTreatment(e.target.value)} className={inputClass}>
              <option value="">Todos</option>
              {TREATMENTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.emoji} {t.animal}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-sm"
            >
              {isPending ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
      </form>

      {/* Results table */}
      {searched && hospitals.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-600">
              <span className="text-slate-900 font-bold">{hospitals.length}</span> resultado{hospitals.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="text-emerald-600 font-bold">✓</span> = atende
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap text-xs uppercase tracking-wide">Unidade</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">Município</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">CNES</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Telefone</th>
                  {TABLE_TREATMENTS.map((t) => (
                    <th
                      key={t.value}
                      className={`px-2 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap text-center ${
                        TREATMENT_TEXT_CLASS[t.value] ?? 'text-slate-500'
                      }`}
                    >
                      {shortTreatmentLabel(t.label)}
                    </th>
                  ))}
                  {showDistance && (
                    <th className="px-4 py-3 font-semibold text-slate-600 text-right text-xs uppercase tracking-wide whitespace-nowrap">Dist.</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hospitals.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-900 truncate text-sm">{h.name}</div>
                      {h.address && (
                        <div className="text-xs text-slate-400 truncate mt-0.5">{h.address}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-sm">
                      {h.city}
                      <span className="ml-1.5 text-xs font-semibold text-slate-400">{h.state_code}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{h.cnes ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                      {h.phones ? (
                        <a href={`tel:${h.phones.replace(/\D/g, '')}`} className="hover:text-emerald-600 transition-colors">
                          {h.phones}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    {TABLE_TREATMENTS.map((t) => (
                      <td key={t.value} className="px-2 py-3 text-center">
                        {h.treatments.includes(t.value) ? (
                          <span className={`text-sm font-bold ${TREATMENT_TEXT_CLASS[t.value] ?? 'text-slate-400'}`}>✓</span>
                        ) : (
                          <span className="text-slate-200 text-sm">—</span>
                        )}
                      </td>
                    ))}
                    {showDistance && (
                      <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap font-medium">
                        {h.distance_km !== undefined ? `${h.distance_km.toFixed(1)} km` : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
