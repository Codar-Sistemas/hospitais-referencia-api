import type { Hospital, HospitalSearchResponse, NearbyHospitalsResponse } from './types';

export const API_BASE =
  process.env['NEXT_PUBLIC_API_URL'] || 'https://hospitais-referencia-api.vercel.app';

function buildUrl(
  path: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

// Translates the EN API error message into a user-facing Portuguese string.
// Callers display the returned value directly. The mapping is small enough
// to keep inline rather than splitting it into its own module.
function translateApiError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes('rate limit'))
    return 'Muitas requisições. Aguarde alguns segundos e tente novamente.';
  if (lower.includes('cep') && lower.includes('not found')) return 'CEP não encontrado.';
  if (lower.includes('hospital') && lower.includes('not found')) return 'Hospital não encontrado.';
  if (lower.includes('state') && lower.includes('not found')) return 'Estado não encontrado.';
  if (lower.includes('invalid treatment')) return 'Tipo de atendimento inválido.';
  if (lower.includes('invalid id')) return 'Identificador inválido.';
  if (lower.includes('provide at least one filter'))
    return 'Informe ao menos um filtro: estado, cidade ou termo de busca.';
  if (lower.includes('provide at least one of'))
    return 'Informe ao menos um de: coordenadas, CEP ou cidade.';
  if (lower.includes('unable to determine a city'))
    return 'Não foi possível determinar uma cidade para a busca.';
  if (lower.includes('internal error'))
    return 'Erro interno do servidor. Tente novamente em instantes.';
  return 'Erro ao consultar a API. Verifique sua conexão e tente novamente.';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error || body.message || message;
    } catch {
      // Body not JSON — keep the generic HTTP message.
    }
    throw new Error(translateApiError(message));
  }
  return (await res.json()) as T;
}

export interface SearchHospitalsParams {
  stateCode?: string | undefined;
  city?: string | undefined;
  treatment?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function searchHospitals(params: SearchHospitalsParams): Promise<Hospital[]> {
  const url = buildUrl('/v1/hospitals', {
    state_code: params.stateCode,
    city: params.city,
    treatment: params.treatment,
    q: params.q,
    limit: params.limit,
    offset: params.offset,
  });
  const data = await request<HospitalSearchResponse>(url, { next: { revalidate: 600 } });
  return data.hospitals ?? [];
}

export interface SearchNearbyParams {
  cep?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  city?: string | undefined;
  stateCode?: string | undefined;
  treatment?: string | undefined;
  radiusM?: number | undefined;
  limit?: number | undefined;
}

export async function searchNearby(params: SearchNearbyParams): Promise<NearbyHospitalsResponse> {
  const url = buildUrl('/v1/hospitals/nearby', {
    cep: params.cep,
    lat: params.lat,
    lng: params.lng,
    city: params.city,
    state_code: params.stateCode,
    treatment: params.treatment,
    radius_m: params.radiusM,
    limit: params.limit,
  });
  return request<NearbyHospitalsResponse>(url, { cache: 'no-store' });
}

// ---------------------------------------------------------------------------
// Public stats
// ---------------------------------------------------------------------------

export interface StatsResponse {
  generated_at: string;
  overview: {
    total_searches: number;
    searches_with_results: number;
    searches_empty: number;
    distinct_users: number;
    distinct_user_states: number;
    avg_results_per_search: number | null;
  } | null;
  demand_by_user_state: { state_code: string; searches: number; distinct_users: number }[];
  treatment_popularity_30d: { treatment: string; searches: number }[];
  search_timeline_30d: { day: string; searches: number; distinct_users: number }[];
  sync_resilience_90d: {
    total_runs: number;
    successful_runs: number;
    failed_runs: number;
    unchanged_runs: number;
    ocr_fallback_runs: number;
    llm_fallback_runs: number;
    llm_gemini_runs: number;
    llm_groq_runs: number;
    success_rate_pct: number | null;
  } | null;
  coverage_by_state: {
    state_code: string;
    name: string;
    total_hospitals: number;
    status: string | null;
    synced_at: string | null;
    hospitals_count: number;
    geocoded_count: number;
    ocr_records: number;
    llm_records: number;
  }[];
}

export async function fetchStats(): Promise<StatsResponse> {
  return request<StatsResponse>(`${API_BASE}/v1/stats`, { next: { revalidate: 300 } });
}
