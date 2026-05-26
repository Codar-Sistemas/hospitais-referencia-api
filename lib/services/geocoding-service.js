const cepRepo = require('../repositories/cep-repo');
const { BrasilApiCepProvider } = require('../providers/cep');
const { NominatimProvider } = require('../providers/nominatim');

// Singletons — instantiated once per cold start.
const cepProvider = new BrasilApiCepProvider({
  userAgent:
    'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)',
});
const nominatim = new NominatimProvider();

// Build a Nominatim-friendly query from the CEP address payload.
// Drops missing parts so we don't generate "undefined, undefined, City, SP".
function buildAddressQuery({ street, neighborhood, city, state_code }) {
  const parts = [street, neighborhood, city, state_code, 'Brasil'].filter(Boolean);
  return parts.join(', ');
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
  // using the structured address so we can keep doing real radius search.
  if (!result.lat || !result.lng) {
    const query = buildAddressQuery(result);
    const geo = query ? await nominatim.geocode(query) : null;
    if (geo) {
      result.lat = geo.lat;
      result.lng = geo.lng;
    }
  }

  // Fire-and-forget cache write (now with possibly-enriched coords).
  // PostgREST INSERT with ignore-duplicates: a no-op if the cep already
  // existed, but if we just enriched coords on a stale row we still want
  // the new values, so let the repo do an upsert.
  cepRepo.cache(result);
  return result;
}

module.exports = { lookupCep };
