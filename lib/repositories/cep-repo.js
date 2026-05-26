const { sb, sbUpsert } = require('../core/supabase');

async function findCached(cep) {
  try {
    const rows = await sb('cep_cache', { select: '*', cep: `eq.${cep}`, limit: '1' });
    if (!rows || !rows.length) return null;
    const c = rows[0];
    return {
      cep,
      city: c.city,
      state_code: c.state_code,
      neighborhood: c.neighborhood,
      street: c.street,
      lat: c.lat,
      lng: c.lng,
    };
  } catch {
    return null;
  }
}

// Best-effort cache write. Uses upsert (merge-duplicates) so a stale row
// with NULL coords gets overwritten when we later enrich it via Nominatim.
async function cache(data) {
  try {
    await sbUpsert('cep_cache', data, 'cep');
  } catch {
    // intentional no-op
  }
}

module.exports = { findCached, cache };
