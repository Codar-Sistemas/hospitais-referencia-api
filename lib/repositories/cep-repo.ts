import { sb, sbUpsert } from '../core/supabase.js';
import type { CepRecord } from '../types/domain.js';

export async function findCached(cep: string): Promise<CepRecord | null> {
  try {
    const rows = await sb<CepRecord>('cep_cache', {
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

// Merge-duplicates so a row previously cached without coords is enriched
// the next time the same CEP is looked up via Nominatim.
export async function cache(data: Partial<CepRecord> & { cep: string }): Promise<void> {
  try {
    await sbUpsert('cep_cache', data, 'cep');
  } catch {
    // Best-effort. Failed cache writes are visible via api_metrics.
  }
}
