/**
 * Query-string helpers shared by every handler.
 *
 * Two responsibilities:
 *   1. Backward-compat aliases (PT → EN). When a caller still uses
 *      `?uf=SP` we keep accepting it but emit `Deprecation` / `Sunset`
 *      headers so integrations have 90 days to migrate.
 *   2. Strict numeric parsing with sensible defaults, since JS's native
 *      `parseInt('abc')` returns `NaN` instead of throwing.
 */

import type { Response } from '../types/http.js';

const DEPRECATION_DAYS = 90;

/** Maps each canonical EN param to the legacy PT aliases we still accept. */
const PARAM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  state_code: ['uf'],
  city: ['municipio', 'cidade'],
  treatment: ['atendimento'],
  radius_m: ['raio'],
};

export function sunsetDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() + DEPRECATION_DAYS * 24 * 60 * 60 * 1000);
  return d.toUTCString();
}

interface ParamLookup {
  value: string | null;
  deprecated: boolean;
}

function getParam(searchParams: URLSearchParams, canonical: string): ParamLookup {
  const direct = searchParams.get(canonical);
  if (direct !== null && direct !== '') return { value: direct, deprecated: false };
  const aliases = PARAM_ALIASES[canonical] ?? [];
  for (const alias of aliases) {
    const v = searchParams.get(alias);
    if (v !== null && v !== '') return { value: v, deprecated: true };
  }
  return { value: null, deprecated: false };
}

/**
 * Reads multiple canonical params at once and adds deprecation headers if
 * any of them came through via a legacy alias.
 */
export function readParams<K extends string>(
  searchParams: URLSearchParams,
  canonicals: readonly K[],
  res: Response | null,
): Record<K, string | null> {
  const out: Record<string, string | null> = {};
  let anyDeprecated = false;
  for (const name of canonicals) {
    const { value, deprecated } = getParam(searchParams, name);
    out[name] = value;
    if (deprecated) anyDeprecated = true;
  }
  if (anyDeprecated && res) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetDate());
  }
  return out;
}

export interface ParseIntOptions {
  fallback: number;
  max?: number;
  min?: number;
}

export function parseIntParam(
  value: string | null | undefined,
  { fallback, max, min = 0 }: ParseIntOptions,
): number {
  const n = parseInt(value ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  let result = Math.max(n, min);
  if (typeof max === 'number') result = Math.min(result, max);
  return result;
}

export function parseFloatParam(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}
