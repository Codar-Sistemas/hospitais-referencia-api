/**
 * Geocoding orchestration.
 *
 * `lookupCep` is the single entry point. It composes three caches/sources
 * in this order:
 *
 *   1. Local `cep_cache` table — instant, costs nothing, may have coords.
 *   2. BrasilAPI — fresh CEP data; coordinates often missing.
 *   3. Nominatim (OSM) — coordinate fallback when BrasilAPI has none.
 *      Uses a progressive query chain (street → neighborhood → city) so
 *      we still get a usable centre even for streets not in OSM.
 *
 * Every successful lookup is written back to `cep_cache` (merge upsert)
 * so the next request for the same CEP costs zero.
 */

import { BrasilApiCepProvider, type CepLookupResult } from '../providers/cep.js';
import { NominatimProvider } from '../providers/nominatim.js';
import * as cepRepo from '../repositories/cep-repo.js';
import type { CepRecord } from '../types/domain.js';

// Singletons — instantiated once per cold start.
const cepProvider = new BrasilApiCepProvider({
  userAgent:
    'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)',
});
const nominatim = new NominatimProvider();

interface AddressForQuery {
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state_code?: string | null;
}

/**
 * Progressive query fallback: start with the most specific address and
 * widen until Nominatim returns a hit. The narrow queries (with street)
 * give the most accurate pin; the wide ones (city only) guarantee a
 * usable center even when the street isn't indexed in OSM.
 *
 * Itatiba/SP "Travessa Francisco Dantas de Paiva" is a real-world case
 * where the narrow query returns [] but city+state works.
 */
function buildQueryChain(address: AddressForQuery): string[] {
  const queries: string[] = [];
  const { street, neighborhood, city, state_code } = address;
  if (street && city) {
    queries.push([street, neighborhood, city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  if (neighborhood && city) {
    queries.push([neighborhood, city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  if (city) {
    queries.push([city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  // De-duplicate while preserving order (in case street == neighborhood).
  return [...new Set(queries)];
}

async function geocodeAddress(
  address: AddressForQuery,
): Promise<{ lat: number; lng: number } | null> {
  for (const query of buildQueryChain(address)) {
    const hit = await nominatim.geocode(query);
    if (hit) return hit;
  }
  return null;
}

/**
 * Returns the merged best-known CEP record (cache ∪ BrasilAPI ∪ Nominatim)
 * and writes it back to the cache. Returns `null` if every source fails.
 */
export async function lookupCep(
  rawCep: string | null | undefined,
): Promise<CepLookupResult | CepRecord | null> {
  const cep = (rawCep ?? '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  const cached = await cepRepo.findCached(cep);

  // Cache hit with full coordinates — nothing else to do.
  if (cached && cached.lat && cached.lng) return cached;

  // Use cached row (without coords) as the starting payload, or fetch from
  // BrasilAPI on a miss. Either way we'll try to enrich with Nominatim
  // below if we're still missing coordinates.
  const result: CepLookupResult | CepRecord | null = cached ?? (await cepProvider.lookup(cep));
  if (!result) return null;

  if (!result.lat || !result.lng) {
    const geo = await geocodeAddress(result);
    if (geo) {
      result.lat = geo.lat;
      result.lng = geo.lng;
    }
  }

  // Fire-and-forget upsert: stale rows with NULL coords get replaced with
  // the enriched values; first-time inserts work the same.
  void cepRepo.cache(result);
  return result;
}
