/**
 * Lookup tables and helpers that translate user-supplied search terms into
 * the canonical English values persisted to the database.
 *
 * Treatments are stored in English so multilingual clients can consume
 * the API directly. The aliases below cover both the technical Portuguese
 * cognates (`botropico`, `crotalico`) and the everyday animal names
 * (`jararaca`, `cascavel`, `armadeira`) — so a search for "picada de
 * cascavel" maps to the Crotalic antivenom.
 */

import type { Treatment } from '../types/domain.js';

/** Canonical English treatment names — what the DB stores and the API returns. */
export const CANONICAL_TREATMENTS: readonly Treatment[] = [
  'Bothropic',
  'Crotalic',
  'Elapidic',
  'Lachetic',
  'Scorpionic',
  'Loxoscelic',
  'Phoneutric',
  'Lonomic',
  'Antiarachnidic',
];

/**
 * Accepted input aliases. Keys are lowercase + accent-stripped; values are
 * the canonical English `Treatment`. Includes EN canonicals, PT cognates
 * and common animal names for end-user friendliness.
 */
export const TREATMENT_ALIASES: Readonly<Record<string, Treatment>> = {
  bothropic: 'Bothropic',
  crotalic: 'Crotalic',
  elapidic: 'Elapidic',
  lachetic: 'Lachetic',
  scorpionic: 'Scorpionic',
  loxoscelic: 'Loxoscelic',
  phoneutric: 'Phoneutric',
  lonomic: 'Lonomic',
  antiarachnidic: 'Antiarachnidic',
  botropico: 'Bothropic',
  crotalico: 'Crotalic',
  elapidico: 'Elapidic',
  laquetico: 'Lachetic',
  escorpionico: 'Scorpionic',
  loxoscelico: 'Loxoscelic',
  foneutrico: 'Phoneutric',
  lonomico: 'Lonomic',
  antiaracnidico: 'Antiarachnidic',
  bothrops: 'Bothropic',
  jararaca: 'Bothropic',
  cobra: 'Bothropic',
  cascavel: 'Crotalic',
  crotalus: 'Crotalic',
  coral: 'Elapidic',
  micrurus: 'Elapidic',
  surucucu: 'Lachetic',
  lachesis: 'Lachetic',
  escorpiao: 'Scorpionic',
  escorpion: 'Scorpionic',
  scorpion: 'Scorpionic',
  tityus: 'Scorpionic',
  aranha: 'Loxoscelic',
  'aranha marrom': 'Loxoscelic',
  spider: 'Loxoscelic',
  loxosceles: 'Loxoscelic',
  armadeira: 'Phoneutric',
  'aranha armadeira': 'Phoneutric',
  phoneutria: 'Phoneutric',
  lagarta: 'Lonomic',
  caterpillar: 'Lonomic',
  lonomia: 'Lonomic',
};

export function stripAccents(s: string): string {
  // Strips diacritical marks: `é` → `e`, `ç` → `c`, etc.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeKey(s: unknown): string {
  return stripAccents(String(s)).toLowerCase().trim();
}

export function normalizeTreatment(input: string | null | undefined): Treatment | null {
  if (!input) return null;
  return TREATMENT_ALIASES[normalizeKey(input)] ?? null;
}

export function normalizeCity(input: string | null | undefined): string | null {
  if (!input) return null;
  return stripAccents(String(input)).toLowerCase();
}
