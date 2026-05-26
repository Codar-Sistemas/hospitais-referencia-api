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
  if (cached) return cached;

  const result = await cepProvider.lookup(cep);
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
  cepRepo.cache(result);
  return result;
}

module.exports = { lookupCep };
