// Mirrors the Postgres schema (sql/001 → 011). Single source of truth
// consumed by repositories, services and handlers. Changing a column
// requires updating the matching type here — tsc will then walk every
// caller.

// Snake_case DB key. URLs replace `_` with `-` (kebab); see
// URL_TO_DB_VERTICAL in api/index.ts. Keep KNOWN_VERTICALS in
// lib/services/hospital-service.ts in sync with this union.
export type Vertical = 'venomous_animals' | 'rare_diseases' | 'oncology';

// 'all' is the sentinel for cross-vertical queries (`/v1/search`).
export type VerticalOrAll = Vertical | 'all';

// 9 canonical antivenoms. Stored in English so a multilingual frontend
// can consume the API directly.
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

// ISO-3166-2:BR — 27 two-letter codes.
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

// Row shape returned by PostgREST for the `hospitals` table.
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
  /** Attached on namespaced lookups (/v1/{vertical}/hospitals/:id) — the
   * hospital's qualifications in that vertical, same shape as list rows. */
  specialties?: HospitalSpecialtySummary[];
}

/** Per-vertical qualification summary attached to list responses for
 * non-default verticals (e.g. rare_diseases). `qualification_codes` carries
 * the raw "Códigos Habilitados" strings from the official source — the web
 * maps the embedded 35.XX codes to disease-area badges. */
export interface HospitalSpecialtySummary {
  specialty: string;
  habilitado_em: string | null;
  qualification_codes: string[];
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
> & {
  specialties?: HospitalSpecialtySummary[];
};

/** Returned by the `nearby_hospitals` RPC. Adds the computed distance. */
export interface NearbyHospitalRow extends HospitalListRow {
  distance_m: number;
}

/** Hospital + distance_km used by handlers (Math.round((m / 1000) * 10) / 10). */
export interface NearbyHospitalRowWithKm extends NearbyHospitalRow {
  distance_km: number;
}

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
