// Sole owner of PostgREST queries against `hospitals` and the
// `nearby_hospitals` RPC. Services/handlers go through these entry points.

import { sb, sbRpc } from '../core/supabase.js';
import type {
  Hospital,
  HospitalListRow,
  HospitalWithActiveVerticals,
  NearbyHospitalRow,
  StateCode,
  Treatment,
  Vertical,
  VerticalOrAll,
} from '../types/domain.js';

const HOSPITAL_LIST_COLUMNS =
  'id,state_code,city,name,address,phones,cnes,treatments,lat,lng,extraction_source,ocr_confidence,requires_verification,verticals';

// Backwards-compat default — the legacy `/v1/hospitals` routes (pre-MapaSUS)
// implicitly target the venomous-animal hospitals.
export const DEFAULT_VERTICAL: Vertical = 'venomous_animals';

// `null` / `'all'` disables the filter (used by `/v1/search`).
function verticalFilter(vertical: VerticalOrAll | null | undefined): string | null {
  if (vertical === null || vertical === 'all') return null;
  // PostgREST contains-array syntax: verticals @> '{venomous_animals}'
  return `cs.{"${vertical ?? DEFAULT_VERTICAL}"}`;
}

export interface SearchFilters {
  stateCode?: StateCode | null;
  cityNormalized?: string | null;
  treatment?: Treatment | null;
  q?: string | null;
  limit: number;
  offset: number;
  vertical?: VerticalOrAll | null;
  // Pre-resolved id allowlist (e.g. disease-area filter via
  // hospital_specialties). Applied before limit/offset so pagination
  // stays correct.
  ids?: number[] | null;
}

export async function search(filters: SearchFilters): Promise<HospitalListRow[]> {
  const {
    stateCode,
    cityNormalized,
    treatment,
    q,
    limit,
    offset,
    vertical = DEFAULT_VERTICAL,
    ids,
  } = filters;

  const params: Record<string, string> = {
    select: HOSPITAL_LIST_COLUMNS,
    order: 'city.asc,name.asc',
    limit: String(limit),
    offset: String(offset),
  };
  const vf = verticalFilter(vertical);
  if (vf) params['verticals'] = vf;
  if (stateCode) params['state_code'] = `eq.${stateCode}`;
  if (cityNormalized) params['city_normalized'] = `ilike.*${cityNormalized}*`;
  if (treatment) params['treatments'] = `cs.{"${treatment}"}`;
  if (q) params['or'] = `(name.ilike.*${q}*,address.ilike.*${q}*)`;
  if (ids) params['id'] = `in.(${ids.join(',')})`;
  return sb<HospitalListRow>('hospitals', params);
}

export interface SearchByCityFilters {
  stateCode?: StateCode | null;
  cityNormalized: string;
  treatment?: Treatment | null;
  limit: number;
  vertical?: VerticalOrAll | null;
}

export async function searchByCity(filters: SearchByCityFilters): Promise<HospitalListRow[]> {
  const { stateCode, cityNormalized, treatment, limit, vertical = DEFAULT_VERTICAL } = filters;

  const params: Record<string, string> = {
    select: HOSPITAL_LIST_COLUMNS,
    city_normalized: `ilike.*${cityNormalized}*`,
    order: 'city.asc,name.asc',
    limit: String(limit),
  };
  const vf = verticalFilter(vertical);
  if (vf) params['verticals'] = vf;
  if (stateCode) params['state_code'] = `eq.${stateCode}`;
  if (treatment) params['treatments'] = `cs.{"${treatment}"}`;
  return sb<HospitalListRow>('hospitals', params);
}

export interface FindByIdOptions {
  // Pass an explicit vertical to deny cross-vertical access (e.g. the
  // venomous-animals page must not surface an oncology-only hospital).
  // Default is `null` — any vertical is allowed.
  vertical?: VerticalOrAll | null;
}

export async function findById(
  id: number,
  options: FindByIdOptions = {},
): Promise<Hospital | null> {
  const { vertical = null } = options;
  const params: Record<string, string> = {
    select: '*',
    id: `eq.${id}`,
  };
  const vf = verticalFilter(vertical);
  if (vf) params['verticals'] = vf;
  const rows = await sb<Hospital>('hospitals', params);
  return rows[0] ?? null;
}

export interface FindNearbyOptions {
  lat: number;
  lng: number;
  radiusM: number;
  stateCode?: StateCode | null;
  treatment?: Treatment | null;
  limit: number;
  vertical?: VerticalOrAll | null;
}

export async function findNearby(options: FindNearbyOptions): Promise<NearbyHospitalRow[]> {
  const { lat, lng, radiusM, stateCode, treatment, limit, vertical = DEFAULT_VERTICAL } = options;
  return sbRpc<NearbyHospitalRow>('nearby_hospitals', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_state_code: stateCode ?? null,
    p_treatment: treatment ?? null,
    p_limit: limit,
    p_vertical: vertical === 'all' ? null : vertical,
  });
}

/** Raw `hospital_specialties` row subset used to build the per-hospital
 * specialty summaries on list responses. */
export interface SpecialtyRow {
  hospital_id: number;
  specialty: string;
  habilitado_em: string | null;
  metadata: Record<string, unknown> | null;
}

export async function findSpecialtiesByHospitalIds(
  ids: number[],
  vertical: Vertical,
): Promise<SpecialtyRow[]> {
  if (ids.length === 0) return [];
  return sb<SpecialtyRow>('hospital_specialties', {
    select: 'hospital_id,specialty,habilitado_em,metadata',
    hospital_id: `in.(${ids.join(',')})`,
    vertical: `eq.${vertical}`,
    order: 'specialty.asc',
  });
}

/** Every qualification row of a vertical — feeds the disease-area filter.
 * Verticals are small (dozens of establishments), so one unbounded select
 * is cheaper than pushing JSONB matching into PostgREST. */
export async function listSpecialtiesByVertical(vertical: Vertical): Promise<SpecialtyRow[]> {
  return sb<SpecialtyRow>('hospital_specialties', {
    select: 'hospital_id,specialty,habilitado_em,metadata',
    vertical: `eq.${vertical}`,
  });
}

export interface CrossVerticalSearchFilters {
  stateCode?: StateCode | null;
  cityNormalized?: string | null;
  q?: string | null;
  limit: number;
  offset: number;
}

// Backed by `v_hospitals_all`. Rows carry `active_verticals[]` and
// `active_specialties[]` so the UI can render multi-vertical badges
// without an extra round-trip.
export async function searchAcrossVerticals(
  filters: CrossVerticalSearchFilters,
): Promise<HospitalWithActiveVerticals[]> {
  const { stateCode, cityNormalized, q, limit, offset } = filters;
  const params: Record<string, string> = {
    select:
      'id,state_code,city,name,address,phones,cnes,lat,lng,active_verticals,active_specialties',
    order: 'city.asc,name.asc',
    limit: String(limit),
    offset: String(offset),
  };
  if (stateCode) params['state_code'] = `eq.${stateCode}`;
  if (cityNormalized) params['city_normalized'] = `ilike.*${cityNormalized}*`;
  if (q) params['or'] = `(name.ilike.*${q}*,address.ilike.*${q}*)`;
  // Skip hospitals that aren't habilitado in any vertical yet.
  params['active_verticals'] = 'not.eq.{}';
  return sb<HospitalWithActiveVerticals>('v_hospitals_all', params);
}
