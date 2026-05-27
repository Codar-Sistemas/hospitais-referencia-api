// PT → EN backwards-compat. Callers still using `?uf=SP` get
// `Deprecation` / `Sunset` headers (90 days) but continue to work.

import type { Response } from '../types/http.js';

const DEPRECATION_DAYS = 90;

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

// Adds deprecation headers to `res` if any param arrived via legacy alias.
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
