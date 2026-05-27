/**
 * Hospital repository — the only place that builds PostgREST query strings
 * for the `hospitals` table and the `nearby_hospitals` RPC. Everything
 * upstream (services, handlers) goes through these typed entry points.
 */

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

/**
 * Default vertical for backwards compatibility — every legacy API call
 * (the public /v1/hospitals routes from the pre-MapaSUS era) implicitly
 * expects to see the venomous-animal hospitals. Phase 2 ships the new
 * /v1/{vertical}/hospitals routes that pass `vertical` explicitly.
 *
 * The DB key uses the exact gov.br programme name in snake_case
 * ('animais_peconhentos' = "Animais Peçonhentos"). The same value is
 * surfaced on URL paths with hyphens (`/v1/animais-peconhentos/...`);
 * the router in api/index.ts handles the dash↔underscore conversion.
 */
export const DEFAULT_VERTICAL: Vertical = 'animais_peconhentos';

/**
 * Builds the PostgREST `verticals` filter for a vertical scope. Pass
 * `'all'` (or null) to disable the filter and search across every
 * vertical — used by the cross-vertical `/v1/search` endpoint.
 */
function verticalFilter(vertical: VerticalOrAll | null | undefined): string | null {
  if (vertical === null || vertical === 'all') return null;
  // PostgREST contains-array syntax: verticals @> '{animais_peconhentos}'
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
  /**
   * Constrain by vertical to deny cross-vertical access (e.g. peçonhentos
   * page must not surface an oncology-only hospital). Pass `null` to allow
   * any vertical. Defaults to `null` (allow any).
   */
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

export interface CrossVerticalSearchFilters {
  stateCode?: StateCode | null;
  cityNormalized?: string | null;
  q?: string | null;
  limit: number;
  offset: number;
}

/**
 * Cross-vertical search — backed by the `v_hospitals_all` view. Returns
 * hospitals annotated with the full set of active verticals and
 * specialties, so the frontend can render badges like
 * "peçonhentos + oncologia" without an extra round-trip.
 */
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
  // Only include hospitals that are active in at least one vertical.
  params['active_verticals'] = 'not.eq.{}';
  return sb<HospitalWithActiveVerticals>('v_hospitals_all', params);
}
