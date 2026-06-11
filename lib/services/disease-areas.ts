// Disease-area filter vocabulary for qualification-based verticals
// (rare_diseases today). The national policy assigns each disease area a
// stable 35.XX habilitação code — one code for Atenção Especializada and
// one for Serviço de Referência — embedded in the free-text "Códigos
// Habilitados" strings stored on hospital_specialties.metadata. Filtering
// matches on the numeric code, never on the typo-prone text.
//
// Keys are the canonical EN identifiers exposed by the API (`?disease=`);
// PT display labels live in the web registry (web/lib/specialties.ts).

import { ValidationError } from '../core/errors.js';
import type { HospitalSpecialtySummary } from '../types/domain.js';

export const DISEASE_AREA_CODES: Readonly<Record<string, readonly string[]>> = {
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

export type DiseaseArea = keyof typeof DISEASE_AREA_CODES;

export function resolveDiseaseArea(raw: string): DiseaseArea {
  const key = raw.trim().toLowerCase().replaceAll('-', '_');
  if (!(key in DISEASE_AREA_CODES)) {
    throw new ValidationError(
      `Invalid disease: '${raw}'. Accepted values: ${Object.keys(DISEASE_AREA_CODES).join(', ')}`,
    );
  }
  return key;
}

// Matches "35.07", "35.16 ", and the occasional dot-less "3501" in the
// source strings.
const CODE_RE = /35\.?\s?(\d{2})/g;

export function specialtiesMatchArea(
  specialties: HospitalSpecialtySummary[] | undefined,
  area: DiseaseArea,
): boolean {
  const wanted = DISEASE_AREA_CODES[area] ?? [];
  for (const entry of specialties ?? []) {
    for (const raw of entry.qualification_codes) {
      for (const match of raw.matchAll(CODE_RE)) {
        if (match[1] && wanted.includes(match[1])) return true;
      }
    }
  }
  return false;
}
