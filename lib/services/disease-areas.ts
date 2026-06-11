// Per-vertical vocabulary for the `?disease=` filter on qualification-based
// verticals. Each vertical's official source embeds stable numeric
// habilitação codes in free text (rare diseases: 35.XX per the national
// rare-diseases policy; oncology: 17.XX per the CACON/UNACON programme).
// Filtering matches on the numeric code, never on the typo-prone text.
//
// Keys are the canonical EN identifiers the API accepts; PT display labels
// live in the web registry (web/lib/specialties.ts) — keep both in lockstep.

import { ValidationError } from '../core/errors.js';
import type { HospitalSpecialtySummary, Vertical } from '../types/domain.js';

export type QualificationVertical = Exclude<Vertical, 'venomous_animals'>;

const RARE_DISEASE_AREA_CODES: Readonly<Record<string, readonly string[]>> = {
  congenital_anomalies: ['01', '07'],
  intellectual_disability: ['02', '08'],
  inborn_metabolism_errors: ['03', '09'],
  inflammatory_diseases: ['04', '11'],
  infectious_diseases: ['05', '12'],
  autoimmune_diseases: ['06', '10'],
  other_non_genetic: ['13', '14'],
  genetic_counseling: ['15'],
  gene_therapy: ['16'],
};

// Capability-level filter: a code can serve several capabilities (17.13 is
// CACON + radiotherapy + pediatric oncology). CACON rows count as
// radiotherapy because the qualification requires it by norm.
const ONCOLOGY_SERVICE_CODES: Readonly<Record<string, readonly string[]>> = {
  cacon: ['12', '13'],
  unacon: ['06', '07', '08', '09', '10', '11'],
  radiotherapy: ['04', '07', '12', '13', '15'],
  hematology: ['08', '10'],
  pediatric_oncology: ['09', '11', '13'],
  clinical_oncology: ['16'],
  oncology_surgery: ['14'],
  synchronous_treatment: ['22'],
  breast_reconstruction: ['23'],
};

export const DISEASE_AREA_CODES_BY_VERTICAL: Readonly<
  Record<QualificationVertical, Readonly<Record<string, readonly string[]>>>
> = {
  rare_diseases: RARE_DISEASE_AREA_CODES,
  oncology: ONCOLOGY_SERVICE_CODES,
};

// Matches "35.07" / "3501" (rare) or "17.07" / "1707" (oncology).
const CODE_RE_BY_VERTICAL: Readonly<Record<QualificationVertical, RegExp>> = {
  rare_diseases: /35\.?\s?(\d{2})/g,
  oncology: /17\.?\s?(\d{2})/g,
};

export type DiseaseArea = string;

export function resolveDiseaseArea(raw: string, vertical: QualificationVertical): DiseaseArea {
  const vocabulary = DISEASE_AREA_CODES_BY_VERTICAL[vertical];
  const key = raw.trim().toLowerCase().replaceAll('-', '_');
  if (!(key in vocabulary)) {
    throw new ValidationError(
      `Invalid disease: '${raw}'. Accepted values for ${vertical}: ${Object.keys(vocabulary).join(', ')}`,
    );
  }
  return key;
}

export function specialtiesMatchArea(
  specialties: HospitalSpecialtySummary[] | undefined,
  area: DiseaseArea,
  vertical: QualificationVertical,
): boolean {
  const wanted = DISEASE_AREA_CODES_BY_VERTICAL[vertical][area] ?? [];
  const codeRe = CODE_RE_BY_VERTICAL[vertical];
  for (const entry of specialties ?? []) {
    for (const raw of entry.qualification_codes) {
      for (const match of raw.matchAll(codeRe)) {
        if (match[1] && wanted.includes(match[1])) return true;
      }
    }
  }
  return false;
}
