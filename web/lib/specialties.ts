// Maps qualification data to user-facing PT badges and filter options for
// the qualification-based verticals (rare diseases: 35.XX codes; oncology:
// 17.XX codes per the CACON/UNACON programme).
//
// The source free-text has typos and casing drift, but the embedded numeric
// code is stable — badges and filters key off it. The API only ever attaches
// the consulted vertical's specialties to a response, so the code PREFIX
// (35 vs 17) identifies the vocabulary without an extra prop.
//
// Keep the filter `value`s in lockstep with the backend vocabulary in
// lib/services/disease-areas.ts.

import type { Hospital, HospitalSpecialty } from './types';

// ---------------------------------------------------------------------------
// Rare diseases (35.XX) — one code maps to one disease area.
// ---------------------------------------------------------------------------
const RARE_CODE_TO_AREAS: Record<string, readonly string[]> = {
  '01': ['Anomalias congênitas'],
  '07': ['Anomalias congênitas'],
  '02': ['Deficiência intelectual'],
  '08': ['Deficiência intelectual'],
  '03': ['Erros inatos do metabolismo'],
  '09': ['Erros inatos do metabolismo'],
  '04': ['Doenças inflamatórias'],
  '11': ['Doenças inflamatórias'],
  '05': ['Doenças infecciosas'],
  '12': ['Doenças infecciosas'],
  '06': ['Doenças autoimunes'],
  '10': ['Doenças autoimunes'],
  '13': ['Outras de origem não genética'],
  '14': ['Outras de origem não genética'],
  '15': ['Aconselhamento genético'],
  '16': ['Terapia gênica'],
};

// ---------------------------------------------------------------------------
// Oncology (17.XX) — one code can carry several capabilities (17.13 is a
// CACON with mandatory radiotherapy and pediatric oncology).
// ---------------------------------------------------------------------------
const ONCOLOGY_CODE_TO_AREAS: Record<string, readonly string[]> = {
  '04': ['Radioterapia'],
  '06': ['UNACON'],
  '07': ['UNACON', 'Radioterapia'],
  '08': ['UNACON', 'Hematologia'],
  '09': ['UNACON', 'Oncologia pediátrica'],
  '10': ['UNACON', 'Hematologia'],
  '11': ['UNACON', 'Oncologia pediátrica'],
  '12': ['CACON', 'Radioterapia'],
  '13': ['CACON', 'Radioterapia', 'Oncologia pediátrica'],
  '14': ['Cirurgia oncológica'],
  '15': ['Radioterapia'],
  '16': ['Oncologia clínica'],
  '22': ['Tratamento sincrônico'],
  '23': ['Reconstrução mamária'],
};

// PT labels for the canonical specialty keys — fallback when a
// qualification row carries no parseable codes.
export const SPECIALTY_LABEL_BY_KEY: Record<string, string> = {
  rare_diseases_reference: 'Serviço de Referência',
  rare_diseases_specialized_care: 'Atenção Especializada',
  gene_therapy: 'Terapia gênica',
  cacon: 'CACON',
  unacon: 'UNACON',
  isolated_radiotherapy: 'Radioterapia',
  radiotherapy_complex: 'Radioterapia',
  oncology_surgery: 'Cirurgia oncológica',
  synchronous_treatment: 'Tratamento sincrônico',
  breast_reconstruction: 'Reconstrução mamária',
  // Saúde mental (CAPS): specialties key-based — não há código de portaria
  // na fonte, então o badge vem sempre deste mapa. Manter em sincronia com
  // scripts/syncs/mental_health/subtipos.py e lib/services/disease-areas.ts.
  caps_i: 'CAPS I',
  caps_ii: 'CAPS II',
  caps_iii: 'CAPS III (24h)',
  caps_ij: 'CAPS Infantojuvenil',
  caps_ad: 'CAPS AD (álcool e drogas)',
  caps_ad_iii: 'CAPS AD III (24h)',
  caps_ad_iv: 'CAPS AD IV',
};

// Matches "35.07" / "17.07", with optional dot/space ("3501", "17 07").
const CODE_RE = /(35|17)\.?\s?(\d{2})/g;

const AREAS_BY_PREFIX: Record<string, Record<string, readonly string[]>> = {
  '35': RARE_CODE_TO_AREAS,
  '17': ONCOLOGY_CODE_TO_AREAS,
};

/** Deduped badges for a hospital's qualifications. Falls back to the
 * service-type label for rows without parseable codes. */
export function specialtyBadges(hospital: Pick<Hospital, 'specialties'>): string[] {
  const badges: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    if (!seen.has(label)) {
      seen.add(label);
      badges.push(label);
    }
  };

  for (const entry of hospital.specialties ?? []) {
    let matchedAny = false;
    for (const raw of entry.qualification_codes) {
      for (const match of raw.matchAll(CODE_RE)) {
        const areas = AREAS_BY_PREFIX[match[1] ?? '']?.[match[2] ?? ''];
        for (const area of areas ?? []) {
          matchedAny = true;
          push(area);
        }
      }
    }
    if (!matchedAny) {
      const fallback = SPECIALTY_LABEL_BY_KEY[entry.specialty];
      if (fallback) push(fallback);
    }
  }
  return badges;
}

/** Service-type labels for compact contexts like the professional table. */
export function specialtyTypeLabels(specialties: HospitalSpecialty[] | undefined): string[] {
  const labels = (specialties ?? []).map((s) => SPECIALTY_LABEL_BY_KEY[s.specialty] ?? s.specialty);
  return [...new Set(labels)];
}

// ---------------------------------------------------------------------------
// Search filter options — `value`s are the canonical EN keys the API accepts
// as `?disease=` (see lib/services/disease-areas.ts).
// ---------------------------------------------------------------------------
export const RARE_DISEASE_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'congenital_anomalies', label: 'Anomalias congênitas' },
  { value: 'intellectual_disability', label: 'Deficiência intelectual' },
  { value: 'inborn_metabolism_errors', label: 'Erros inatos do metabolismo' },
  { value: 'inflammatory_diseases', label: 'Doenças inflamatórias' },
  { value: 'infectious_diseases', label: 'Doenças infecciosas' },
  { value: 'autoimmune_diseases', label: 'Doenças autoimunes' },
  { value: 'other_non_genetic', label: 'Outras de origem não genética' },
  { value: 'genetic_counseling', label: 'Aconselhamento genético' },
  { value: 'gene_therapy', label: 'Terapia gênica' },
];

export const ONCOLOGY_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'cacon', label: 'CACON' },
  { value: 'unacon', label: 'UNACON' },
  { value: 'radiotherapy', label: 'Radioterapia' },
  { value: 'hematology', label: 'Hematologia' },
  { value: 'pediatric_oncology', label: 'Oncologia pediátrica' },
  { value: 'clinical_oncology', label: 'Oncologia clínica' },
  { value: 'oncology_surgery', label: 'Cirurgia oncológica' },
  { value: 'synchronous_treatment', label: 'Tratamento sincrônico' },
  { value: 'breast_reconstruction', label: 'Reconstrução mamária' },
];

export const CAPS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'caps_i', label: 'CAPS I' },
  { value: 'caps_ii', label: 'CAPS II' },
  { value: 'caps_iii', label: 'CAPS III (24h)' },
  { value: 'caps_ij', label: 'CAPS Infantojuvenil' },
  { value: 'caps_ad', label: 'CAPS AD (álcool e outras drogas)' },
  { value: 'caps_ad_iii', label: 'CAPS AD III (24h)' },
  { value: 'caps_ad_iv', label: 'CAPS AD IV' },
];
