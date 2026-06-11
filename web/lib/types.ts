// Canonical shape returned by the API (English fields).
export interface Hospital {
  id: number;
  state_code: string;
  city: string;
  name: string;
  address: string | null;
  phones: string | null;
  cnes: string | null;
  treatments: string[];
  lat?: number | null;
  lng?: number | null;
  distance_m?: number;
  distance_km?: number;
  extraction_source?: 'pdf_text' | 'pdf_ocr';
  ocr_confidence?: number | null;
  requires_verification?: boolean;
  // Present on non-default verticals (e.g. rare-diseases): the hospital's
  // qualifications with the raw "Códigos Habilitados" strings.
  specialties?: HospitalSpecialty[];
}

export interface HospitalSpecialty {
  specialty: string;
  habilitado_em: string | null;
  qualification_codes: string[];
}

export interface HospitalSearchResponse {
  filters?: Record<string, unknown>;
  total_returned?: number;
  hospitals: Hospital[];
}

export interface NearbyOrigin {
  lat?: number;
  lng?: number;
  source?: string;
  cep?: Record<string, unknown>;
  city_search?: string;
  cep_no_coords?: boolean;
  city_fallback?: boolean;
  [key: string]: unknown;
}

export interface NearbyHospitalsResponse {
  origin: NearbyOrigin;
  radius_m?: number;
  total_returned?: number;
  notice?: string;
  hospitals: Hospital[];
}

export type SearchMode = 'animal' | 'cep' | 'city';
