// `lookupCep` composes three sources in order: cep_cache → BrasilAPI →
// Nominatim. Every successful lookup is written back to cep_cache so the
// next request for the same CEP costs zero.

import { BrasilApiCepProvider, type CepLookupResult } from '../providers/cep.js';
import { NominatimProvider } from '../providers/nominatim.js';
import * as cepRepo from '../repositories/cep-repo.js';
import type { CepRecord } from '../types/domain.js';

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

// Try the most specific query first, then widen. Itatiba/SP "Travessa
// Francisco Dantas de Paiva" is a real case where the street-level
// query returns [] but city+state works.
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

// Returns the merged best-known CEP (cache ∪ BrasilAPI ∪ Nominatim) and
// writes the result back to the cache. `null` if every source fails.
export async function lookupCep(
  rawCep: string | null | undefined,
): Promise<CepLookupResult | CepRecord | null> {
  const cep = (rawCep ?? '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  const cached = await cepRepo.findCached(cep);
  if (cached && cached.lat && cached.lng) return cached;

  const result: CepLookupResult | CepRecord | null = cached ?? (await cepProvider.lookup(cep));
  if (!result) return null;

  if (!result.lat || !result.lng) {
    const geo = await geocodeAddress(result);
    if (geo) {
      result.lat = geo.lat;
      result.lng = geo.lng;
    }
  }

  void cepRepo.cache(result);
  return result;
}
