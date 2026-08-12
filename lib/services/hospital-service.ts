// Business rules for the hospital endpoints — input validation, vertical
// allowlist, treatment alias resolution, coordinate fallback. No HTTP or
// DB access lives here.

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
import {
  resolveDiseaseArea,
  specialtiesMatchArea,
  type DiseaseArea,
  type QualificationVertical,
} from './disease-areas.js';
import { lookupCep } from './geocoding-service.js';
import { CANONICAL_TREATMENTS, normalizeCity, normalizeTreatment } from './search-normalizer.js';

export const DEFAULT_VERTICAL: Vertical = hospitalRepo.DEFAULT_VERTICAL;

// Allowlist of MapaSUS verticals — rejects fabricated paths
// (`/v1/foo/hospitals`) before they hit the DB. Adding a new vertical
// requires updating: this Set, the `Vertical` type in lib/types/domain.ts,
// and `URL_TO_DB_VERTICAL` in api/index.ts.
export const KNOWN_VERTICALS: ReadonlySet<Vertical> = new Set<Vertical>([
  'venomous_animals',
  'rare_diseases',
  'oncology',
  'mental_health',
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

// The default vertical answers "what does this hospital treat" with the
// `treatments` column; other verticals (rare_diseases, oncology) answer it
// with `hospital_specialties`. Attach those rows — one batched query — so
// list/nearby responses can render qualification badges without N+1 calls.
async function attachSpecialties<T extends HospitalListRow>(
  rows: T[],
  vertical: VerticalOrAll,
): Promise<void> {
  if (vertical === 'all' || vertical === DEFAULT_VERTICAL || rows.length === 0) return;
  const specialtyRows = await hospitalRepo.findSpecialtiesByHospitalIds(
    rows.map((r) => r.id),
    vertical,
  );
  const byHospital = new Map<number, HospitalListRow['specialties']>();
  for (const s of specialtyRows) {
    const codes = s.metadata?.['qualification_codes'];
    const entry = {
      specialty: s.specialty,
      habilitado_em: s.habilitado_em,
      qualification_codes: Array.isArray(codes) ? codes.map(String) : [],
    };
    const list = byHospital.get(s.hospital_id);
    if (list) list.push(entry);
    else byHospital.set(s.hospital_id, [entry]);
  }
  for (const row of rows) {
    row.specialties = byHospital.get(row.id) ?? [];
  }
}

// The `disease` filter only makes sense on qualification-based verticals —
// the default (venomous) filters by the `treatment` vocabulary instead.
function resolveDiseaseFilter(
  rawDisease: string | null | undefined,
  vertical: VerticalOrAll,
): DiseaseArea | null {
  if (!rawDisease) return null;
  if (vertical === 'all' || vertical === DEFAULT_VERTICAL) {
    throw new ValidationError(
      "The 'disease' filter is only available on qualification-based verticals " +
        '(e.g. /v1/rare-diseases/hospitals). Use treatment= on the default vertical.',
    );
  }
  // The guards above excluded 'all' and the default vertical; TS can't
  // narrow via the DEFAULT_VERTICAL constant, hence the cast.
  return resolveDiseaseArea(rawDisease, vertical as QualificationVertical);
}

// Resolves a disease-area filter to the hospital ids qualified for it.
// One small query (a vertical has dozens of rows); matching happens on the
// stable 35.XX codes inside metadata.qualification_codes.
async function findIdsByDiseaseArea(
  vertical: QualificationVertical,
  area: DiseaseArea,
): Promise<number[]> {
  const rows = await hospitalRepo.listSpecialtiesByVertical(vertical);
  const ids = new Set<number>();
  for (const row of rows) {
    const codes = row.metadata?.['qualification_codes'];
    const summary = {
      specialty: row.specialty,
      habilitado_em: row.habilitado_em,
      qualification_codes: Array.isArray(codes) ? codes.map(String) : [],
    };
    if (specialtiesMatchArea([summary], area, vertical)) ids.add(row.hospital_id);
  }
  return [...ids];
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
  // OCR-derived states need a manual-verification badge in the UI.
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
  disease: string | null;
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
    disease: string | null;
    q: string | null;
    limit: number;
    offset: number;
    vertical: VerticalOrAll;
  };
  total_returned: number;
  hospitals: HospitalListRow[];
}

export async function listHospitals(params: ListHospitalsParams): Promise<ListHospitalsResult> {
  const {
    stateCode,
    city,
    treatment: rawTreatment,
    disease: rawDisease,
    q,
    limit,
    offset,
    vertical,
  } = params;
  if (!stateCode && !city && !q) {
    throw new ValidationError(
      'Provide at least one filter: state_code, city or q. Ex: /v1/hospitals?state_code=SP',
    );
  }
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const disease = resolveDiseaseFilter(rawDisease, v);

  const filtersEcho = {
    state_code: stateCode,
    city,
    treatment: rawTreatment,
    disease: rawDisease,
    q,
    limit,
    offset,
    vertical: v,
  };

  // Disease filter resolves to an id allowlist BEFORE the hospitals query
  // so limit/offset paginate the filtered set.
  let ids: number[] | null = null;
  if (disease) {
    // resolveDiseaseFilter already rejected 'all'/default verticals.
    ids = await findIdsByDiseaseArea(v as QualificationVertical, disease);
    if (ids.length === 0) {
      return { filters: filtersEcho, total_returned: 0, hospitals: [] };
    }
  }

  const rows = await hospitalRepo.search({
    stateCode,
    cityNormalized: city ? normalizeCity(city) : null,
    treatment,
    q,
    limit,
    offset,
    vertical: v,
    ids,
  });
  await attachSpecialties(rows, v);
  return {
    filters: filtersEcho,
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
  // Namespaced lookups (/v1/{vertical}/hospitals/:id) carry the hospital's
  // qualifications, same as list/nearby — detail views need the badges.
  if (v) await attachSpecialties([row], v);
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

// Powers `/v1/search`. Returns rows annotated with `active_verticals`
// so a single result can advertise every SUS programme it serves.
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

// Discriminated union — each branch lists exactly the fields it carries.
// `exactOptionalPropertyTypes` rejects shared-bag shapes with optional
// fields, so we model the variants explicitly.
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

type ResolvedOriginWithCoords = Extract<ResolvedOrigin, { lat: number; lng: number }>;
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
    // Where the *user* is — independent of the UF they're querying.
    // Powers geographic-reach metrics.
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
  disease?: string | null;
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
    disease: rawDisease,
    vertical,
  } = params;
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const disease = resolveDiseaseFilter(rawDisease, v);
  const { origin, stateCode: resolvedStateCode } = await resolveOrigin({
    lat,
    lng,
    cep,
    city,
    stateCode,
  });

  // With coords: distance-sorted via nearby_hospitals RPC.
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
    await attachSpecialties(rows, v);
    // Disease filter is applied after the RPC (it has no qualification
    // awareness). Limit ran pre-filter, which can under-fill a page — fine
    // for qualification verticals, whose universe is a few dozen rows.
    const filtered = disease
      ? rows.filter((h) => specialtiesMatchArea(h.specialties, disease, v as QualificationVertical))
      : rows;
    return {
      origin,
      radius_m: radiusM,
      total_returned: filtered.length,
      hospitals: filtered.map((h) => ({
        ...h,
        distance_km: Math.round((h.distance_m / 1000) * 10) / 10,
      })),
    };
  }

  // Without coords: city-based search (unordered). Use the CEP's city
  // fallback if the user gave a CEP without coordinates, else the
  // explicit `city` param.
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
  await attachSpecialties(rows, v);
  const filtered = disease
    ? rows.filter((h) => specialtiesMatchArea(h.specialties, disease, v as QualificationVertical))
    : rows;
  return {
    origin: { ...origin, city_search: citySearch },
    total_returned: filtered.length,
    hospitals: filtered,
    notice: 'Results by city (not ordered by distance).',
  };
}
