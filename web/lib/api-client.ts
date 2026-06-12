import type {
  CrossVerticalHospital,
  CrossVerticalSearchResponse,
  Hospital,
  HospitalSearchResponse,
  NearbyHospitalsResponse,
} from './types';

import { API_URL } from './site';

// Fetch base for actual API calls. A local/preview deploy can point the
// client at a different API via NEXT_PUBLIC_API_URL (e.g. http://localhost:3001);
// otherwise the canonical public API is used. This is intentionally separate
// from the DOCUMENTED API URL (`API_URL`), which always stays canonical.
// Re-exported for telemetry.ts and other callers.
export const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || API_URL;

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
  disease?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export async function searchHospitals(
  vertical: string,
  params: SearchHospitalsParams,
): Promise<Hospital[]> {
  const url = buildUrl(`/v1/${vertical}/hospitals`, {
    state_code: params.stateCode,
    city: params.city,
    treatment: params.treatment,
    disease: params.disease,
    q: params.q,
    limit: params.limit,
    offset: params.offset,
  });
  const data = await request<HospitalSearchResponse>(url, { next: { revalidate: 600 } });
  return data.hospitals ?? [];
}

// Single hospital, vertical-scoped: 404s when the hospital doesn't belong to
// the vertical, and the response carries that vertical's `specialties`.
export async function fetchHospital(vertical: string, id: number | string): Promise<Hospital> {
  return request<Hospital>(`${API_BASE}/v1/${vertical}/hospitals/${id}`, {
    next: { revalidate: 600 },
  });
}

export interface SearchNearbyParams {
  cep?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  city?: string | undefined;
  stateCode?: string | undefined;
  treatment?: string | undefined;
  disease?: string | undefined;
  radiusM?: number | undefined;
  limit?: number | undefined;
}

export async function searchNearby(
  vertical: string,
  params: SearchNearbyParams,
): Promise<NearbyHospitalsResponse> {
  const url = buildUrl(`/v1/${vertical}/hospitals/nearby`, {
    cep: params.cep,
    lat: params.lat,
    lng: params.lng,
    city: params.city,
    state_code: params.stateCode,
    treatment: params.treatment,
    disease: params.disease,
    radius_m: params.radiusM,
    limit: params.limit,
  });
  return request<NearbyHospitalsResponse>(url, { cache: 'no-store' });
}

// ---------------------------------------------------------------------------
// Cross-vertical search (hub) — one query across every active vertical.
// ---------------------------------------------------------------------------
export interface CrossVerticalSearchParams {
  stateCode?: string | undefined;
  city?: string | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

export async function searchAcrossVerticals(
  params: CrossVerticalSearchParams,
): Promise<CrossVerticalHospital[]> {
  const url = buildUrl('/v1/search', {
    state_code: params.stateCode,
    city: params.city,
    q: params.q,
    limit: params.limit,
  });
  const data = await request<CrossVerticalSearchResponse>(url, { next: { revalidate: 600 } });
  return data.hospitals ?? [];
}

// ---------------------------------------------------------------------------
// Public stats
// ---------------------------------------------------------------------------

export interface StatsResponse {
  generated_at: string;
  /** Per-vertical footprint (hospitals + last sync). Empty until the prod DB
   * has migration 020 — the page renders the section only when present. */
  by_vertical: {
    vertical: string;
    hospitals_count: number;
    geocoded_count: number;
    last_sync_status: string | null;
    last_sync_at: string | null;
  }[];
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
  /** Domain analytics (migration 021). All optional so the page degrades
   * gracefully against an older API build that predates them. */
  specialties_by_vertical?: {
    vertical: string;
    specialty: string;
    hospitals_count: number;
  }[];
  /** Hospitals/cities per (state, vertical). States absent for a vertical
   * have zero coverage — the page derives the assistance-void chips and the
   * regional distribution from this matrix. */
  state_vertical_coverage?: {
    state_code: string;
    vertical: string;
    hospitals_count: number;
    cities_count: number;
  }[];
  top_cities?: { city: string; state_code: string; hospitals_count: number }[];
  data_quality?: {
    total_hospitals: number;
    geocoded: number;
    geocode_failed: number;
    geocode_pending: number;
    requires_verification: number;
    with_cnes: number;
    with_phones: number;
    llm_extracted: number;
    ocr_extracted: number;
  } | null;
}

export async function fetchStats(): Promise<StatsResponse> {
  return request<StatsResponse>(`${API_BASE}/v1/stats`, { next: { revalidate: 300 } });
}
