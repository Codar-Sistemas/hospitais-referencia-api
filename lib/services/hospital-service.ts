/**
 * Hospital service — orchestrates business rules for every public read
 * path: list/search/find-nearby/cross-vertical search. Handlers in
 * `lib/handlers/hospitals.ts` are thin adapters that translate HTTP
 * params into calls here.
 *
 * Responsibilities:
 *   - input validation (vertical allowlist, treatment alias resolution)
 *   - coordinate resolution (`lat+lng` | `cep` | `city` → coords or fallback)
 *   - error semantics (`ValidationError` for bad input, `NotFoundError` for misses)
 *
 * Pure business logic — no HTTP or DB access lives here.
 */

import { NotFoundError, ValidationError } from '../core/errors.js';
import * as hospitalRepo from '../repositories/hospital-repo.js';
import * as stateRepo from '../repositories/state-repo.js';
import type {
  Hospital,
  HospitalListRow,
  HospitalWithActiveVerticals,
  NearbyHospitalRow,
  NearbyHospitalRowWithKm,
  StateCode,
  StateSummary,
  StateSummaryWithVerification,
  Treatment,
  Vertical,
  VerticalOrAll,
} from '../types/domain.js';
import { lookupCep } from './geocoding-service.js';
import { CANONICAL_TREATMENTS, normalizeCity, normalizeTreatment } from './search-normalizer.js';

export const DEFAULT_VERTICAL: Vertical = hospitalRepo.DEFAULT_VERTICAL;

/**
 * Verticais conhecidas pela plataforma MapaSUS. Servem de allowlist para
 * recusar paths inventados (`/v1/foo/hospitals`) antes mesmo de tocar o
 * banco. Ao adicionar uma vertical nova, atualize este Set, o tipo
 * `Vertical` em lib/types/domain.ts e o regex em api/index.ts
 * (VERTICAL_PREFIX + URL_TO_DB_VERTICAL).
 *
 * Convenção:
 *   DB key + Python module : snake_case (ex.: 'animais_peconhentos')
 *   URL path               : kebab-case (ex.: '/v1/animais-peconhentos/...')
 */
export const KNOWN_VERTICALS: ReadonlySet<Vertical> = new Set<Vertical>([
  'animais_peconhentos',
  'doencas_raras',
  'oncologia',
]);

export function resolveVertical(vertical: string | null | undefined): VerticalOrAll {
  if (!vertical || vertical === DEFAULT_VERTICAL) return DEFAULT_VERTICAL;
  if (vertical === 'all') return 'all';
  if (!KNOWN_VERTICALS.has(vertical as Vertical)) {
    throw new ValidationError(
      `Unknown vertical '${vertical}'. Known: ${[...KNOWN_VERTICALS].join(', ')}`,
    );
  }
  return vertical as Vertical;
}

function resolveTreatment(rawTreatment: string | null | undefined): Treatment | null {
  if (!rawTreatment) return null;
  const canonical = normalizeTreatment(rawTreatment);
  if (!canonical) {
    throw new ValidationError(
      `Invalid treatment: '${rawTreatment}'. Accepted values: ${CANONICAL_TREATMENTS.join(', ')}`,
    );
  }
  return canonical;
}

export async function listStates(): Promise<StateSummaryWithVerification[]> {
  const rows = await stateRepo.listStates();
  // `requires_verification` is computed for the client: any state whose
  // data came in via OCR needs a human verification badge.
  return rows.map((r) => ({ ...r, requires_verification: r.status === 'ok_ocr' }));
}

export async function getState(stateCode: string): Promise<StateSummary> {
  const code = String(stateCode || '').toUpperCase();
  const row = await stateRepo.findByCode(code);
  if (!row) throw new NotFoundError(`State '${code}' not found`);
  return row;
}

export interface ListHospitalsParams {
  stateCode: StateCode | null;
  city: string | null;
  treatment: string | null;
  q: string | null;
  limit: number;
  offset: number;
  vertical?: string | null;
}

export interface ListHospitalsResult {
  filters: {
    state_code: StateCode | null;
    city: string | null;
    treatment: string | null;
    q: string | null;
    limit: number;
    offset: number;
    vertical: VerticalOrAll;
  };
  total_returned: number;
  hospitals: HospitalListRow[];
}

export async function listHospitals(params: ListHospitalsParams): Promise<ListHospitalsResult> {
  const { stateCode, city, treatment: rawTreatment, q, limit, offset, vertical } = params;
  if (!stateCode && !city && !q) {
    throw new ValidationError(
      'Provide at least one filter: state_code, city or q. Ex: /v1/hospitals?state_code=SP',
    );
  }
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const rows = await hospitalRepo.search({
    stateCode,
    cityNormalized: city ? normalizeCity(city) : null,
    treatment,
    q,
    limit,
    offset,
    vertical: v,
  });
  return {
    filters: {
      state_code: stateCode,
      city,
      treatment: rawTreatment,
      q,
      limit,
      offset,
      vertical: v,
    },
    total_returned: rows.length,
    hospitals: rows,
  };
}

export interface GetHospitalOptions {
  vertical?: string | null;
}

export async function getHospital(
  id: string | number,
  options: GetHospitalOptions = {},
): Promise<Hospital> {
  const n = typeof id === 'number' ? id : parseInt(id, 10);
  if (!n) throw new ValidationError('Invalid ID');
  const v = options.vertical ? resolveVertical(options.vertical) : null;
  const row = await hospitalRepo.findById(n, { vertical: v });
  if (!row) throw new NotFoundError(`Hospital ${n} not found`);
  return row;
}

export interface CrossVerticalSearchParams {
  stateCode: StateCode | null;
  city: string | null;
  q: string | null;
  limit: number;
  offset: number;
}

export interface CrossVerticalSearchResult {
  filters: {
    state_code: StateCode | null;
    city: string | null;
    q: string | null;
    limit: number;
    offset: number;
    vertical: 'all';
  };
  total_returned: number;
  hospitals: HospitalWithActiveVerticals[];
}

/**
 * Cross-vertical full-text-ish search. Used by the public `/v1/search`
 * endpoint to surface a hospital regardless of which SUS programme it is
 * habilitado for. Returns rows with `active_verticals` so the UI can
 * badge them with the programmes they participate in.
 */
export async function searchAcrossVerticals(
  params: CrossVerticalSearchParams,
): Promise<CrossVerticalSearchResult> {
  const { stateCode, city, q, limit, offset } = params;
  if (!stateCode && !city && !q) {
    throw new ValidationError(
      'Provide at least one filter: state_code, city or q. Ex: /v1/search?q=curitiba',
    );
  }
  const rows = await hospitalRepo.searchAcrossVerticals({
    stateCode,
    cityNormalized: city ? normalizeCity(city) : null,
    q,
    limit,
    offset,
  });
  return {
    filters: { state_code: stateCode, city, q, limit, offset, vertical: 'all' },
    total_returned: rows.length,
    hospitals: rows,
  };
}

/**
 * Discriminated union of every shape `resolveOrigin` can return. Each
 * branch lists exactly the fields it carries — `exactOptionalPropertyTypes`
 * in tsconfig means we can't sprinkle `cep?: unknown` and quietly omit it.
 */
type ResolvedOrigin =
  | {
      source: 'coords';
      lat: number;
      lng: number;
    }
  | {
      source: 'cep';
      lat: number;
      lng: number;
      cep: unknown;
      user_state_code: string | null;
    }
  | {
      source: 'cep_no_coords';
      cep: unknown;
      city_fallback: string | null;
      user_state_code: string | null;
    }
  | {
      source: 'city';
    };

/** The two branches that carry latitude/longitude. */
type ResolvedOriginWithCoords = Extract<ResolvedOrigin, { lat: number; lng: number }>;
/** The two branches that don't. */
type ResolvedOriginWithoutCoords = Exclude<ResolvedOrigin, { lat: number; lng: number }>;

interface ResolveOriginParams {
  lat: number | null;
  lng: number | null;
  cep: string | null;
  city: string | null;
  stateCode: StateCode | null;
}

interface ResolveOriginResult {
  origin: ResolvedOrigin;
  stateCode: StateCode | null;
}

async function resolveOrigin(params: ResolveOriginParams): Promise<ResolveOriginResult> {
  const { lat, lng, cep, city, stateCode } = params;

  if (lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return { origin: { lat, lng, source: 'coords' }, stateCode };
  }

  if (cep) {
    const cepData = await lookupCep(cep);
    if (!cepData) throw new NotFoundError(`CEP '${cep}' not found`);
    // `user_state_code` captures where the *user* is, regardless of which
    // UF they're searching hospitals in. Used by analytics for geographic
    // reach metrics.
    const user_state_code = cepData.state_code ?? null;
    if (cepData.lat && cepData.lng) {
      return {
        origin: {
          lat: cepData.lat,
          lng: cepData.lng,
          source: 'cep',
          cep: cepData,
          user_state_code,
        },
        stateCode,
      };
    }
    // CEP without coordinates — fall back to city search.
    return {
      origin: {
        source: 'cep_no_coords',
        cep: cepData,
        city_fallback: cepData.city,
        user_state_code,
      },
      stateCode: stateCode ?? cepData.state_code,
    };
  }

  if (city) {
    return { origin: { source: 'city' }, stateCode };
  }

  throw new ValidationError(
    'Provide at least one of: lat+lng, cep, or city. Ex: /v1/hospitals/nearby?cep=13280000&radius_m=50000',
  );
}

export interface ListNearbyParams {
  lat: number | null;
  lng: number | null;
  cep: string | null;
  city: string | null;
  stateCode: StateCode | null;
  radiusM: number;
  limit: number;
  treatment: string | null;
  vertical?: string | null;
}

export interface ListNearbyByDistanceResult {
  origin: ResolvedOriginWithCoords;
  radius_m: number;
  total_returned: number;
  hospitals: NearbyHospitalRowWithKm[];
}

export interface ListNearbyByCityResult {
  origin: ResolvedOriginWithoutCoords & { city_search: string };
  total_returned: number;
  hospitals: HospitalListRow[];
  notice: string;
}

export type ListNearbyResult = ListNearbyByDistanceResult | ListNearbyByCityResult;

export async function listNearbyHospitals(params: ListNearbyParams): Promise<ListNearbyResult> {
  const {
    lat,
    lng,
    cep,
    city,
    stateCode,
    radiusM,
    limit,
    treatment: rawTreatment,
    vertical,
  } = params;
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const { origin, stateCode: resolvedStateCode } = await resolveOrigin({
    lat,
    lng,
    cep,
    city,
    stateCode,
  });

  // Mode 1: we have coordinates — use the nearby_hospitals RPC for
  // distance-sorted results.
  if (origin.source === 'coords' || origin.source === 'cep') {
    const rows: NearbyHospitalRow[] = await hospitalRepo.findNearby({
      lat: origin.lat,
      lng: origin.lng,
      radiusM,
      stateCode: resolvedStateCode,
      treatment,
      limit,
      vertical: v,
    });
    return {
      origin,
      radius_m: radiusM,
      total_returned: rows.length,
      hospitals: rows.map((h) => ({
        ...h,
        distance_km: Math.round((h.distance_m / 1000) * 10) / 10,
      })),
    };
  }

  // Mode 2: city-based search (no distance ordering). Pull a city out of
  // either the CEP fallback or the explicit `city` param.
  const cepCity =
    origin.source === 'cep_no_coords' && origin.cep && typeof origin.cep === 'object'
      ? (origin.cep as { city?: string | null }).city
      : null;
  const citySearch = cepCity ?? city;
  if (!citySearch) {
    throw new ValidationError('Unable to determine a city for search');
  }

  const normalizedCity = normalizeCity(citySearch);
  if (!normalizedCity) {
    throw new ValidationError('Unable to determine a city for search');
  }

  const rows = await hospitalRepo.searchByCity({
    stateCode: resolvedStateCode,
    cityNormalized: normalizedCity,
    treatment,
    limit,
    vertical: v,
  });
  return {
    origin: { ...origin, city_search: citySearch },
    total_returned: rows.length,
    hospitals: rows,
    notice: 'Results by city (not ordered by distance).',
  };
}
