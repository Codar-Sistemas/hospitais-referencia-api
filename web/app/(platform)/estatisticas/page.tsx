import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchStats, type StatsResponse } from '@/lib/api-client';
import { STATES, TREATMENT_LABEL_BY_VALUE } from '@/lib/constants';
import { POPULATION_BY_REGION, REGION_BY_STATE, REGIONS } from '@/lib/regions';
import { SPECIALTY_LABEL_BY_KEY } from '@/lib/specialties';
import { THEME_DOT_CLASS, VERTICAL_BY_DB_KEY } from '@/lib/verticals';

export const metadata: Metadata = {
  title: 'Estatísticas',
  description:
    'Métricas públicas de uso, alcance e resiliência da plataforma MapaSUS — dados oficiais do Ministério da Saúde.',
};

// Server component — runs on the API/SSR side and benefits from
// Next's incremental cache. Public, no auth required.
export const revalidate = 300;

// Empty payload rendered when the API is unreachable. Crucially this keeps the
// build from failing: /stats is statically generated (ISR), so a build-time
// fetch error would otherwise abort the whole `next build`. The page already
// degrades gracefully on empty arrays / null, and ISR backfills real data
// within `revalidate` once the API responds again.
const EMPTY_STATS: StatsResponse = {
  generated_at: new Date(0).toISOString(),
  by_vertical: [],
  overview: null,
  demand_by_user_state: [],
  treatment_popularity_30d: [],
  search_timeline_30d: [],
  sync_resilience_90d: null,
  coverage_by_state: [],
  specialties_by_vertical: [],
  state_vertical_coverage: [],
  top_cities: [],
  data_quality: null,
};

// PT label for a `hospital_specialties.specialty` key. The venomous vertical
// stores canonical treatment names (e.g. 'Bothropic'); the qualification
// verticals store snake_case habilitation keys (e.g. 'cacon').
function specialtyLabel(vertical: string, key: string): string {
  if (vertical === 'venomous_animals') return TREATMENT_LABEL_BY_VALUE[key] ?? key;
  return SPECIALTY_LABEL_BY_KEY[key] ?? key;
}

// PT labels + pill colors for sync_logs.status values.
const SYNC_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  success: { label: 'Sincronizado', className: 'bg-emerald-50 text-emerald-700' },
  unchanged: { label: 'Sem mudanças', className: 'bg-slate-100 text-slate-600' },
  failed: { label: 'Falhou', className: 'bg-red-50 text-red-700' },
  unsupported: { label: 'Não suportado', className: 'bg-amber-50 text-amber-700' },
};

export default async function StatsPage() {
  let data: StatsResponse;
  try {
    data = await fetchStats();
  } catch {
    data = EMPTY_STATS;
  }
  const overview = data.overview;
  const resilience = data.sync_resilience_90d;
  // `?? []` guards against an older API build that predates `by_vertical`.
  const byVertical = data.by_vertical ?? [];
  const maxDemand = Math.max(...data.demand_by_user_state.map((r) => r.searches), 1);
  const maxTreatment = Math.max(...data.treatment_popularity_30d.map((r) => r.searches), 1);
  const maxTimeline = Math.max(...data.search_timeline_30d.map((r) => r.searches), 1);
  const totalHospitals = data.coverage_by_state.reduce((acc, s) => acc + s.hospitals_count, 0);
  const totalGeocoded = data.coverage_by_state.reduce((acc, s) => acc + s.geocoded_count, 0);
  const statesCovered = data.coverage_by_state.filter((s) => s.hospitals_count > 0).length;

  // Domain analytics (migration 021) — `?? []`/`?? null` guard against an
  // older API build that predates these fields.
  const specialtiesByVertical = data.specialties_by_vertical ?? [];
  const stateVerticalCoverage = data.state_vertical_coverage ?? [];
  const topCities = data.top_cities ?? [];
  const quality = data.data_quality ?? null;
  const maxCity = Math.max(...topCities.map((c) => c.hospitals_count), 1);

  // Stable vertical ordering: by hospital count when 020 is live, otherwise
  // whatever the coverage matrix mentions.
  const verticalKeys =
    byVertical.length > 0
      ? byVertical.map((r) => r.vertical)
      : [...new Set(stateVerticalCoverage.map((r) => r.vertical))];

  // Specialty rows arrive pre-sorted by hospitals_count desc within each
  // vertical — group them preserving that order.
  const specialtiesGrouped = new Map<string, typeof specialtiesByVertical>();
  for (const row of specialtiesByVertical) {
    const list = specialtiesGrouped.get(row.vertical) ?? [];
    list.push(row);
    specialtiesGrouped.set(row.vertical, list);
  }

  // Assistance voids: UFs with no row in the coverage matrix for a vertical.
  const coveredStatesByVertical = new Map<string, Set<string>>();
  for (const row of stateVerticalCoverage) {
    const set = coveredStatesByVertical.get(row.vertical) ?? new Set<string>();
    set.add(row.state_code);
    coveredStatesByVertical.set(row.vertical, set);
  }
  const gapsByVertical = verticalKeys.map((vertical) => {
    const covered = coveredStatesByVertical.get(vertical) ?? new Set<string>();
    return {
      vertical,
      missing: STATES.filter((s) => !covered.has(s.code)).map((s) => s.code),
    };
  });

  // Regional distribution: region → vertical → hospitals.
  const regionMatrix = new Map<string, Map<string, number>>();
  for (const row of stateVerticalCoverage) {
    const region = REGION_BY_STATE[row.state_code];
    if (!region) continue;
    const perVertical = regionMatrix.get(region) ?? new Map<string, number>();
    perVertical.set(row.vertical, (perVertical.get(row.vertical) ?? 0) + row.hospitals_count);
    regionMatrix.set(region, perVertical);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">
          Transparência
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Estatísticas públicas</h1>
        <p className="text-slate-600 max-w-2xl">
          Dados de uso, cobertura geográfica e resiliência operacional da API. Atualizado a cada 5
          minutos. Dados de IP são anonimizados (SHA-256 + salt).
        </p>
      </header>

      {/* Overview cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Buscas (30 dias)" value={overview?.total_searches ?? 0} />
        <Stat label="Usuários únicos" value={overview?.distinct_users ?? 0} />
        <Stat label="Hospitais cadastrados" value={totalHospitals} />
        <Stat label="UFs com cobertura" value={`${statesCovered}/27`} />
      </section>

      {/* Per-vertical footprint — rendered only when the API exposes it
          (migration 020). One card per health area: hospitals, geocoding
          coverage and the last sync run's outcome. */}
      {byVertical.length > 0 && (
        <section>
          <Card title="Por área de saúde">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {byVertical.map((row) => {
                const v = VERTICAL_BY_DB_KEY[row.vertical];
                if (!v) return null;
                const sync = SYNC_STATUS_LABEL[row.last_sync_status ?? ''] ?? null;
                return (
                  <Link
                    key={row.vertical}
                    href={`/${v.slug}`}
                    className="group rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                      <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                        {v.label}
                      </span>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-slate-900">
                      {row.hospitals_count.toLocaleString('pt-BR')}
                      <span className="ml-1.5 text-xs font-medium text-slate-400">hospitais</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.geocoded_count.toLocaleString('pt-BR')} geocodificados (
                      {row.hospitals_count > 0
                        ? Math.round((row.geocoded_count / row.hospitals_count) * 100)
                        : 0}
                      %)
                    </p>
                    {sync && row.last_sync_at && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${sync.className}`}>
                          {sync.label}
                        </span>
                        <span className="text-slate-400">
                          {new Date(row.last_sync_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          </Card>
        </section>
      )}

      {/* Specialty footprint — how many hospitals offer each soro grade /
          SUS habilitation, per vertical (migration 021). */}
      {specialtiesGrouped.size > 0 && (
        <section>
          <Card title="Serviços e especialidades por área">
            <div className="grid gap-6 lg:grid-cols-3">
              {verticalKeys.map((vertical) => {
                const v = VERTICAL_BY_DB_KEY[vertical];
                const rows = specialtiesGrouped.get(vertical);
                if (!v || !rows || rows.length === 0) return null;
                const maxCount = Math.max(...rows.map((r) => r.hospitals_count), 1);
                return (
                  <div key={vertical}>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-3">
                      <span className={`w-2 h-2 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                      {v.label}
                    </p>
                    <ul className="space-y-2">
                      {rows.map((row) => (
                        <li key={row.specialty} className="flex items-center gap-3 text-sm">
                          <span
                            className="w-36 truncate text-slate-700"
                            title={specialtyLabel(vertical, row.specialty)}
                          >
                            {specialtyLabel(vertical, row.specialty)}
                          </span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${THEME_DOT_CLASS[v.theme]}`}
                              style={{ width: `${(row.hospitals_count / maxCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 text-right tabular-nums text-slate-600">
                            {row.hospitals_count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-snug">
              Número de hospitais habilitados em cada serviço ou tipo de soro. Um hospital pode
              aparecer em mais de uma categoria.
            </p>
          </Card>
        </section>
      )}

      {/* Assistance voids — UFs with zero coverage per vertical. The most
          actionable public-interest number on this page. */}
      {stateVerticalCoverage.length > 0 && (
        <section>
          <Card title="Vazios assistenciais — UFs sem unidade habilitada">
            <ul className="space-y-4">
              {gapsByVertical.map(({ vertical, missing }) => {
                const v = VERTICAL_BY_DB_KEY[vertical];
                if (!v) return null;
                return (
                  <li key={vertical} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="flex items-center gap-2 sm:w-48 shrink-0 text-sm font-semibold text-slate-800">
                      <span className={`w-2 h-2 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                      {v.label}
                    </span>
                    {missing.length === 0 ? (
                      <span className="text-sm text-emerald-700">
                        Todas as 27 UFs têm ao menos uma unidade.
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-slate-500 mr-1">
                          {missing.length} {missing.length === 1 ? 'UF' : 'UFs'} sem cobertura:
                        </span>
                        {missing.map((uf) => (
                          <span
                            key={uf}
                            className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-xs font-mono font-semibold"
                          >
                            {uf}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-slate-400 mt-4 leading-snug">
              UFs sem nenhum estabelecimento habilitado na área. Pacientes dessas UFs dependem de
              deslocamento interestadual (Tratamento Fora de Domicílio — TFD).
            </p>
          </Card>
        </section>
      )}

      {/* Regional distribution with per-capita rates (Censo 2022). */}
      {regionMatrix.size > 0 && (
        <section>
          <Card title="Distribuição regional">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-2">Região</th>
                    {verticalKeys.map((vertical) => {
                      const v = VERTICAL_BY_DB_KEY[vertical];
                      return (
                        <th key={vertical} className="text-right py-2 px-2">
                          {v?.shortLabel ?? vertical}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {REGIONS.map((region) => {
                    const perVertical = regionMatrix.get(region);
                    const populationM = POPULATION_BY_REGION[region] / 1_000_000;
                    return (
                      <tr key={region} className="border-b border-slate-100">
                        <td className="py-2 px-2 font-medium text-slate-700">{region}</td>
                        {verticalKeys.map((vertical) => {
                          const count = perVertical?.get(vertical) ?? 0;
                          return (
                            <td key={vertical} className="py-2 px-2 text-right tabular-nums">
                              {count > 0 ? (
                                <>
                                  <span className="font-medium text-slate-800">
                                    {count.toLocaleString('pt-BR')}
                                  </span>
                                  <span className="ml-1.5 text-xs text-slate-400">
                                    {(count / populationM).toLocaleString('pt-BR', {
                                      maximumFractionDigits: 1,
                                      minimumFractionDigits: 1,
                                    })}
                                    /mi
                                  </span>
                                </>
                              ) : (
                                <span className="text-red-600 font-medium">0</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-4 leading-snug">
              Unidades habilitadas por região e taxa por milhão de habitantes (população residente
              do Censo 2022/IBGE).
            </p>
          </Card>
        </section>
      )}

      {/* Municipal concentration + data quality */}
      {(topCities.length > 0 || quality) && (
        <section className="grid lg:grid-cols-2 gap-8">
          <Card title="Municípios com mais unidades">
            {topCities.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topCities.map((row) => (
                  <li
                    key={`${row.city}-${row.state_code}`}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-44 truncate text-slate-700" title={row.city}>
                      {row.city}
                      <span className="ml-1 text-xs text-slate-400 font-mono">
                        {row.state_code}
                      </span>
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-sky-500 h-full"
                        style={{ width: `${(row.hospitals_count / maxCity) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums text-slate-600">
                      {row.hospitals_count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Qualidade dos dados">
            {!quality ? (
              <p className="text-sm text-slate-400">Sem dados ainda.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <MiniStat
                    label="Geocodificados"
                    value={
                      quality.total_hospitals > 0
                        ? `${Math.round((quality.geocoded / quality.total_hospitals) * 100)}%`
                        : '—'
                    }
                    accent="emerald"
                  />
                  <MiniStat label="Geocoding pendente" value={quality.geocode_pending} />
                  <MiniStat
                    label="Geocoding falhou"
                    value={quality.geocode_failed}
                    accent={quality.geocode_failed > 0 ? 'red' : 'slate'}
                  />
                  <MiniStat
                    label="Requer verificação"
                    value={quality.requires_verification}
                    accent={quality.requires_verification > 0 ? 'amber' : 'slate'}
                  />
                  <MiniStat
                    label="Com CNES"
                    value={
                      quality.total_hospitals > 0
                        ? `${Math.round((quality.with_cnes / quality.total_hospitals) * 100)}%`
                        : '—'
                    }
                  />
                  <MiniStat
                    label="Com telefone"
                    value={
                      quality.total_hospitals > 0
                        ? `${Math.round((quality.with_phones / quality.total_hospitals) * 100)}%`
                        : '—'
                    }
                  />
                </div>
                <p className="text-xs text-slate-400 mt-4 leading-snug">
                  Completude dos {quality.total_hospitals.toLocaleString('pt-BR')} registros:
                  cobertura de coordenadas, fila de geocodificação e linhas extraídas por OCR/LLM
                  que aguardam verificação manual.
                </p>
              </>
            )}
          </Card>
        </section>
      )}

      {/* Demand by user state */}
      <section className="grid lg:grid-cols-2 gap-8">
        <Card title="Demanda por UF do usuário (30 dias)">
          {data.demand_by_user_state.length === 0 ? (
            <p className="text-sm text-slate-400">
              Ainda sem dados suficientes — a UF do usuário só é registrada em buscas por CEP.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.demand_by_user_state.map((row) => (
                <li key={row.state_code} className="flex items-center gap-3 text-sm">
                  <span className="w-10 font-mono font-semibold text-slate-700">
                    {row.state_code}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${(row.searches / maxDemand) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-slate-600">
                    {row.searches}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Tipos de soro mais buscados (30 dias)">
          {data.treatment_popularity_30d.length === 0 ? (
            <p className="text-sm text-slate-400">Ainda sem buscas filtradas por tipo de soro.</p>
          ) : (
            <ul className="space-y-2">
              {data.treatment_popularity_30d.map((row) => (
                <li key={row.treatment} className="flex items-center gap-3 text-sm">
                  <span className="w-32 font-medium text-slate-700">
                    {TREATMENT_LABEL_BY_VALUE[row.treatment] ?? row.treatment}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${(row.searches / maxTreatment) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-slate-600">
                    {row.searches}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Timeline */}
      <section>
        <Card title="Buscas diárias (últimos 30 dias)">
          {data.search_timeline_30d.length === 0 ? (
            <p className="text-sm text-slate-400">Sem dados ainda.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {data.search_timeline_30d.map((row) => (
                <div
                  key={row.day}
                  className="flex-1 bg-emerald-500 rounded-t-sm hover:bg-emerald-600 transition-colors"
                  style={{ height: `${(row.searches / maxTimeline) * 100}%` }}
                  title={`${row.day}: ${row.searches} buscas`}
                />
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Sync resilience */}
      <section>
        <Card title="Resiliência da sincronização (últimos 90 dias)">
          {!resilience ? (
            <p className="text-sm text-slate-400">Sem dados ainda.</p>
          ) : (
            <div className="grid sm:grid-cols-5 gap-4">
              <MiniStat label="Execuções totais" value={resilience.total_runs} />
              <MiniStat
                label="Taxa de sucesso"
                value={`${resilience.success_rate_pct ?? 0}%`}
                accent="emerald"
              />
              <MiniStat label="Falhas" value={resilience.failed_runs} accent="red" />
              <MiniStat
                label="Fallback LLM"
                value={resilience.llm_fallback_runs}
                accent="emerald"
              />
              <MiniStat label="Fallback OCR" value={resilience.ocr_fallback_runs} accent="amber" />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4 leading-snug">
            Quando o portal gov.br publica PDFs escaneados, o sistema tenta primeiro extrair via LLM
            (Gemini → Groq); se nenhum provedor estiver disponível, recorre a OCR clássico
            (Tesseract). Linhas extraídas por OCR sempre exibem aviso de verificação manual; linhas
            extraídas por LLM só recebem o aviso quando a confiança fica abaixo de 70%.
          </p>
        </Card>
      </section>

      {/* Coverage by state */}
      <section>
        <Card title="Cobertura por estado">
          <div className="text-sm text-slate-500 mb-3">
            <strong className="text-slate-700 tabular-nums">
              {totalGeocoded.toLocaleString('pt-BR')}
            </strong>{' '}
            de {totalHospitals.toLocaleString('pt-BR')} hospitais com coordenadas (
            {totalHospitals === 0 ? 0 : Math.round((totalGeocoded / totalHospitals) * 100)}%).
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 px-2">UF</th>
                  <th className="text-left py-2 px-2">Estado</th>
                  <th className="text-right py-2 px-2">Hospitais</th>
                  <th className="text-right py-2 px-2">Com coords</th>
                  <th
                    className="text-right py-2 px-2"
                    title="Linhas extraídas por LLM (Gemini/Groq)"
                  >
                    LLM
                  </th>
                  <th
                    className="text-right py-2 px-2"
                    title="Linhas extraídas por OCR clássico (Tesseract)"
                  >
                    OCR
                  </th>
                  <th className="text-left py-2 px-2">Última sync</th>
                </tr>
              </thead>
              <tbody>
                {data.coverage_by_state.map((row) => (
                  <tr key={row.state_code} className="border-b border-slate-100">
                    <td className="py-2 px-2 font-mono font-semibold text-slate-700">
                      {row.state_code}
                    </td>
                    <td className="py-2 px-2 text-slate-600">{row.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {row.hospitals_count.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-500">
                      {row.geocoded_count.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {row.llm_records > 0 ? (
                        <span className="text-emerald-700 font-medium">{row.llm_records}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {row.ocr_records > 0 ? (
                        <span className="text-amber-700 font-medium">{row.ocr_records}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-slate-400">
                      {row.synced_at ? new Date(row.synced_at).toLocaleString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <footer className="text-xs text-slate-400 pt-4 border-t border-slate-100">
        Gerado em {new Date(data.generated_at).toLocaleString('pt-BR')}. Cache de 5 minutos.
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent = 'slate',
}: {
  label: string;
  value: string | number;
  accent?: 'slate' | 'emerald' | 'red' | 'amber';
}) {
  const colors: Record<string, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
  };
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${colors[accent]}`}>
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}
