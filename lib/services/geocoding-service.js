const cepRepo = require('../repositories/cep-repo');
const { BrasilApiCepProvider } = require('../providers/cep');

// Singleton — instantiated once per cold start.
const cepProvider = new BrasilApiCepProvider({
  userAgent:
    'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)',
});

async function lookupCep(rawCep) {
  const cep = (rawCep || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  const cached = await cepRepo.findCached(cep);
  if (cached) return cached;

  const result = await cepProvider.lookup(cep);
  if (!result) return null;

  // Fire-and-forget — don't block the response on cache write.
  cepRepo.cache(result);
  return result;
}

module.exports = { lookupCep };
