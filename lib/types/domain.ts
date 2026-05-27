/**
 * Domain types for the MapaSUS platform.
 *
 * These mirror the Postgres schema (see sql/001 through 011) and are the
 * single source of truth consumed by repositories, services and handlers.
 * If you change a column, update the matching type here and let
 * `tsc --noEmit` walk the codebase reporting every mismatch.
 */

// ----- Verticals -----------------------------------------------------------

/**
 * Canonical DB key (snake_case) for every MapaSUS vertical. URLs and Python
 * modules use the same identifier, except URLs replace underscores with
 * hyphens (`animais-peconhentos`). Keep `KNOWN_VERTICALS` in
 * lib/services/hospital-service.ts and the regex in api/index.ts in sync
 * with this union.
 */
export type Vertical = 'animais_peconhentos' | 'doencas_raras' | 'oncologia';

/** Sentinel for cross-vertical queries (`/v1/search`). */
export type VerticalOrAll = Vertical | 'all';

// ----- Treatments (animais_peconhentos vertical) ---------------------------

/**
 * The 9 canonical antivenom names persisted to `hospitals.treatments`. Stored
 * in English so the same row can be served to multilingual clients without
 * a translation lookup.
 */
export type Treatment =
  | 'Bothropic'
  | 'Crotalic'
  | 'Elapidic'
  | 'Lachetic'
  | 'Scorpionic'
  | 'Loxoscelic'
  | 'Phoneutric'
  | 'Lonomic'
  | 'Antiarachnidic';

// ----- States --------------------------------------------------------------

/** ISO-3166-2:BR — 27 two-letter Brazilian state codes. */
export type StateCode =
  | 'AC'
  | 'AL'
  | 'AM'
  | 'AP'
  | 'BA'
  | 'CE'
  | 'DF'
  | 'ES'
  | 'GO'
  | 'MA'
  | 'MG'
  | 'MS'
  | 'MT'
  | 'PA'
  | 'PB'
  | 'PE'
  | 'PI'
  | 'PR'
  | 'RJ'
  | 'RN'
  | 'RO'
  | 'RR'
  | 'RS'
  | 'SC'
  | 'SE'
  | 'SP'
  | 'TO';

export type SyncStatus = 'ok' | 'ok_ocr' | 'failed' | 'pending' | null;

export type ExtractionSource = 'pdf_text' | 'pdf_ocr' | 'xlsx' | 'legacy_backfill';

export type GeocodingStatus = 'pending' | 'failed' | 'ok' | null;
export type GeocodingSource = 'brasilapi' | 'nominatim' | null;

// ----- Hospital ------------------------------------------------------------

/**
 * A row from the `hospitals` table as returned by PostgREST. Optional fields
 * are nullable in Postgres; required ones are NOT NULL constraints.
 */
export interface Hospital {
  id: number;
  state_code: StateCode;
  city: string;
  name: string;
  address: string | null;
  phones: string | null;
  cnes: string | null;
  treatments: Treatment[];
  treatments_raw: string | null;
  lat: number | null;
  lng: number | null;
  geocoding_status: GeocodingStatus;
  geocoding_source: GeocodingSource;
  geocoded_at: string | null;
  extraction_source: ExtractionSource;
  ocr_confidence: number | null;
  city_normalized: string;
  requires_verification: boolean;
  verticals: Vertical[];
  created_at: string;
  updated_at: string;
}

/** Subset returned by `hospital-repo.search()`. */
export type HospitalListRow = Pick<
  Hospital,
  | 'id'
  | 'state_code'
  | 'city'
  | 'name'
  | 'address'
  | 'phones'
  | 'cnes'
  | 'treatments'
  | 'lat'
  | 'lng'
  | 'extraction_source'
  | 'ocr_confidence'
  | 'requires_verification'
  | 'verticals'
>;

/** Returned by the `nearby_hospitals` RPC. Adds the computed distance. */
export interface NearbyHospitalRow extends HospitalListRow {
  distance_m: number;
}

/** Hospital + distance_km used by handlers (Math.round((m / 1000) * 10) / 10). */
export interface NearbyHospitalRowWithKm extends NearbyHospitalRow {
  distance_km: number;
}

// ----- Hospital specialties (Phase 2 multi-vertical) -----------------------

export interface HospitalSpecialty {
  hospital_id: number;
  vertical: Vertical;
  specialty: string;
  habilitado_em: string | null;
  portaria: string | null;
  source_url: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Row from the `v_hospitals_all` view (cross-vertical search). */
export interface HospitalWithActiveVerticals extends Pick<
  Hospital,
  'id' | 'state_code' | 'city' | 'name' | 'address' | 'phones' | 'cnes' | 'lat' | 'lng'
> {
  active_verticals: Vertical[];
  active_specialties: string[];
}

// ----- State table ---------------------------------------------------------

export interface StateSummary {
  state_code: StateCode;
  name: string;
  updated_at: string | null;
  synced_at: string | null;
  total_hospitals: number;
  status: SyncStatus;
}

/** Annotated by the service layer with a derived `requires_verification`. */
export interface StateSummaryWithVerification extends StateSummary {
  requires_verification: boolean;
}

// ----- CEP / geocoding cache ----------------------------------------------

export interface CepRecord {
  cep: string;
  state_code: StateCode | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  lat: number | null;
  lng: number | null;
  source: 'brasilapi' | 'nominatim' | 'cache' | null;
  cached_at: string;
}
