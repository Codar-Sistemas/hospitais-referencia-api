/**
 * CEP cache repository.
 *
 * Reads come from the public `cep_cache` table (anon key). Writes use the
 * upsert helper so a stale row with NULL coords is overwritten when we
 * later enrich it via Nominatim.
 */

import { sb, sbUpsert } from '../core/supabase.js';
import type { CepRecord } from '../types/domain.js';

type CepRow = CepRecord;

export async function findCached(cep: string): Promise<CepRecord | null> {
  try {
    const rows = await sb<CepRow>('cep_cache', {
      select: '*',
      cep: `eq.${cep}`,
      limit: '1',
    });
    const c = rows[0];
    if (!c) return null;
    return {
      cep,
      city: c.city,
      state_code: c.state_code,
      neighborhood: c.neighborhood,
      street: c.street,
      lat: c.lat,
      lng: c.lng,
      source: c.source ?? null,
      cached_at: c.cached_at,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort cache write. Uses upsert (merge-duplicates) so a stale row
 * with NULL coords gets overwritten when we later enrich it via Nominatim.
 */
export async function cache(data: Partial<CepRecord> & { cep: string }): Promise<void> {
  try {
    await sbUpsert('cep_cache', data, 'cep');
  } catch {
    // intentional no-op — telemetry layer handles failed writes.
  }
}
