const cepRepo = require('../repositories/cep-repo');
const { BrasilApiCepProvider } = require('../providers/cep');
const { NominatimProvider } = require('../providers/nominatim');

// Singletons — instantiated once per cold start.
const cepProvider = new BrasilApiCepProvider({
  userAgent:
    'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)',
});
const nominatim = new NominatimProvider();

// Progressive query fallback: start with the most specific address and
// widen until Nominatim returns a hit. The narrow queries (with street)
// give the most accurate pin; the wide ones (city only) guarantee a
// usable center even when the street isn't indexed in OSM.
//
// Itatiba/SP "Travessa Francisco Dantas de Paiva" is a real-world case
// where the narrow query returns [] but city+state works.
function buildQueryChain({ street, neighborhood, city, state_code }) {
  const queries = [];
  if (street && city) {
    queries.push([street, neighborhood, city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  if (neighborhood && city) {
    queries.push([neighborhood, city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  if (city) {
    queries.push([city, state_code, 'Brasil'].filter(Boolean).join(', '));
  }
  // De-duplicate while preserving order (in case street == neighborhood, etc.)
  return [...new Set(queries)];
}

async function geocodeAddress(address) {
  for (const query of buildQueryChain(address)) {
    const hit = await nominatim.geocode(query);
    if (hit) return hit;
  }
  return null;
}

async function lookupCep(rawCep) {
  const cep = (rawCep || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  const cached = await cepRepo.findCached(cep);

  // If cache already has coords, we're done.
  if (cached && cached.lat && cached.lng) return cached;

  // Cache hit but no coords — keep the address (cheap upgrade path) and
  // skip the BrasilAPI call. We'll try Nominatim below.
  // Cache miss — fetch from BrasilAPI.
  const result = cached ?? (await cepProvider.lookup(cep));
  if (!result) return null;

  // BrasilAPI very often returns CEPs without coordinates (street-level
  // geocoding is incomplete for most of Brazil). Fall back to Nominatim
  // with a progressive query chain so we still get usable coords even
  // when the exact street isn't in OSM (very common for small streets).
  if (!result.lat || !result.lng) {
    const geo = await geocodeAddress(result);
    if (geo) {
      result.lat = geo.lat;
      result.lng = geo.lng;
    }
  }

  // Fire-and-forget upsert: stale rows with NULL coords get replaced
  // with the enriched values; first-time inserts work the same.
  cepRepo.cache(result);
  return result;
}

module.exports = { lookupCep };
