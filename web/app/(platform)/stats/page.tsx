import type { Metadata } from 'next';
import { fetchStats, type StatsResponse } from '@/lib/api-client';
import { TREATMENT_LABEL_BY_VALUE } from '@/lib/constants';

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
  overview: null,
  demand_by_user_state: [],
  treatment_popularity_30d: [],
  search_timeline_30d: [],
  sync_resilience_90d: null,
  coverage_by_state: [],
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
  const maxDemand = Math.max(...data.demand_by_user_state.map((r) => r.searches), 1);
  const maxTreatment = Math.max(...data.treatment_popularity_30d.map((r) => r.searches), 1);
  const maxTimeline = Math.max(...data.search_timeline_30d.map((r) => r.searches), 1);
  const totalHospitals = data.coverage_by_state.reduce((acc, s) => acc + s.hospitals_count, 0);
  const totalGeocoded = data.coverage_by_state.reduce((acc, s) => acc + s.geocoded_count, 0);
  const statesCovered = data.coverage_by_state.filter((s) => s.hospitals_count > 0).length;

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
