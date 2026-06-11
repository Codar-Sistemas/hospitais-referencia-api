// Maps rare-diseases qualification data to user-facing PT badges.
//
// The source XLSX free-text ("Códigos Habilitados") has typos and casing
// drift, but the embedded 35.XX code is stable — it identifies both the
// service type and the disease area per the national rare-diseases policy
// (Portaria GM/MS). We extract codes by regex and map them to short
// disease-area labels; the answer to "which rare diseases does this
// hospital treat" is the deduped set of areas.

import type { Hospital, HospitalSpecialty } from './types';

// 35.XX -> disease area (same area appears under two codes: one for
// Atenção Especializada, one for Serviço de Referência).
const CODE_TO_AREA: Record<string, string> = {
  '01': 'Anomalias congênitas',
  '07': 'Anomalias congênitas',
  '02': 'Deficiência intelectual',
  '08': 'Deficiência intelectual',
  '03': 'Erros inatos do metabolismo',
  '09': 'Erros inatos do metabolismo',
  '04': 'Doenças inflamatórias',
  '11': 'Doenças inflamatórias',
  '05': 'Doenças infecciosas',
  '12': 'Doenças infecciosas',
  '06': 'Doenças autoimunes',
  '10': 'Doenças autoimunes',
  '13': 'Outras de origem não genética',
  '14': 'Outras de origem não genética',
  '15': 'Aconselhamento genético',
  '16': 'Terapia gênica',
};

// PT labels for the canonical specialty keys — fallback when a
// qualification row carries no parseable codes.
export const SPECIALTY_LABEL_BY_KEY: Record<string, string> = {
  rare_diseases_reference: 'Serviço de Referência',
  rare_diseases_specialized_care: 'Atenção Especializada',
  gene_therapy: 'Terapia gênica',
};

// Matches "35.07", "35.16 ", and the occasional dot-less "3501".
const CODE_RE = /35\.?\s?(\d{2})/g;

/** Deduped disease-area badges for a hospital's qualifications. Falls back
 * to the service-type label for rows without parseable codes. */
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
        const area = CODE_TO_AREA[match[1] ?? ''];
        if (area) {
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

/** Service-type labels (Serviço de Referência / Atenção Especializada /
 * Terapia gênica) for compact contexts like the professional table. */
export function specialtyTypeLabels(specialties: HospitalSpecialty[] | undefined): string[] {
  const labels = (specialties ?? []).map((s) => SPECIALTY_LABEL_BY_KEY[s.specialty] ?? s.specialty);
  return [...new Set(labels)];
}
