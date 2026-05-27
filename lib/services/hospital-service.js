const hospitalRepo = require('../repositories/hospital-repo');
const stateRepo = require('../repositories/state-repo');
const { lookupCep } = require('./geocoding-service');
const { CANONICAL_TREATMENTS, normalizeTreatment, normalizeCity } = require('./search-normalizer');
const { NotFoundError, ValidationError } = require('../core/errors');

const DEFAULT_VERTICAL = hospitalRepo.DEFAULT_VERTICAL;

// Verticais conhecidas pela plataforma MapaSUS. Servem de allowlist para
// recusar paths inventados (`/v1/foo/hospitals`) antes mesmo de tocar o
// banco. Ao adicionar uma vertical nova, atualize esse Set e o regex em
// api/index.js.
const KNOWN_VERTICALS = new Set(['peconhentos', 'raras', 'oncologia']);

function resolveVertical(vertical) {
  if (!vertical || vertical === DEFAULT_VERTICAL) return DEFAULT_VERTICAL;
  if (vertical === 'all') return 'all';
  if (!KNOWN_VERTICALS.has(vertical)) {
    throw new ValidationError(
      `Unknown vertical '${vertical}'. Known: ${[...KNOWN_VERTICALS].join(', ')}`,
    );
  }
  return vertical;
}

function resolveTreatment(rawTreatment) {
  if (!rawTreatment) return null;
  const canonical = normalizeTreatment(rawTreatment);
  if (!canonical) {
    throw new ValidationError(
      `Invalid treatment: '${rawTreatment}'. Accepted values: ${CANONICAL_TREATMENTS.join(', ')}`,
    );
  }
  return canonical;
}

async function listStates() {
  const rows = await stateRepo.listStates();
  // requires_verification is computed for the client: any state whose data
  // came in via OCR needs a human verification badge.
  return rows.map((r) => ({ ...r, requires_verification: r.status === 'ok_ocr' }));
}

async function getState(stateCode) {
  const code = String(stateCode || '').toUpperCase();
  const row = await stateRepo.findByCode(code);
  if (!row) throw new NotFoundError(`State '${code}' not found`);
  return row;
}

async function listHospitals({
  stateCode,
  city,
  treatment: rawTreatment,
  q,
  limit,
  offset,
  vertical,
}) {
  if (!stateCode && !city && !q) {
    throw new ValidationError(
      'Provide at least one filter: state_code, city or q. Ex: /v1/hospitals?state_code=SP',
    );
  }
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const rows = await hospitalRepo.search({
    stateCode,
    cityNormalized: city ? normalizeCity(city) : null,
    treatment,
    q,
    limit,
    offset,
    vertical: v,
  });
  return {
    filters: {
      state_code: stateCode,
      city,
      treatment: rawTreatment,
      q,
      limit,
      offset,
      vertical: v,
    },
    total_returned: rows.length,
    hospitals: rows,
  };
}

async function getHospital(id, { vertical } = {}) {
  const n = parseInt(id, 10);
  if (!n) throw new ValidationError('Invalid ID');
  const v = vertical ? resolveVertical(vertical) : undefined;
  const row = await hospitalRepo.findById(n, { vertical: v });
  if (!row) throw new NotFoundError(`Hospital ${n} not found`);
  return row;
}

// Cross-vertical full-text-ish search. Used by the public /v1/search
// endpoint to surface a hospital regardless of which SUS programme it
// is habilitado for. Returns rows with `active_verticals` so the UI can
// badge them with the programmes they participate in.
async function searchAcrossVerticals({ stateCode, city, q, limit, offset }) {
  if (!stateCode && !city && !q) {
    throw new ValidationError(
      'Provide at least one filter: state_code, city or q. Ex: /v1/search?q=curitiba',
    );
  }
  const rows = await hospitalRepo.searchAcrossVerticals({
    stateCode,
    cityNormalized: city ? normalizeCity(city) : null,
    q,
    limit,
    offset,
  });
  return {
    filters: { state_code: stateCode, city, q, limit, offset, vertical: 'all' },
    total_returned: rows.length,
    hospitals: rows,
  };
}

async function resolveOrigin({ lat, lng, cep, city, stateCode }) {
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    return { origin: { lat, lng, source: 'coords' }, stateCode };
  }

  if (cep) {
    const cepData = await lookupCep(cep);
    if (!cepData) throw new NotFoundError(`CEP '${cep}' not found`);
    // user_state_code captures where the *user* is, regardless of which UF
    // they're searching hospitals in. Used by analytics for geographic reach.
    const user_state_code = cepData.state_code || null;
    if (cepData.lat && cepData.lng) {
      return {
        origin: {
          lat: cepData.lat,
          lng: cepData.lng,
          source: 'cep',
          cep: cepData,
          user_state_code,
        },
        stateCode,
      };
    }
    // CEP without coordinates — fall back to city search.
    return {
      origin: {
        source: 'cep_no_coords',
        cep: cepData,
        city_fallback: cepData.city,
        user_state_code,
      },
      stateCode: stateCode || cepData.state_code,
    };
  }

  if (city) {
    return { origin: { source: 'city' }, stateCode };
  }

  throw new ValidationError(
    'Provide at least one of: lat+lng, cep, or city. Ex: /v1/hospitals/nearby?cep=13280000&radius_m=50000',
  );
}

async function listNearbyHospitals({
  lat,
  lng,
  cep,
  city,
  stateCode,
  radiusM,
  limit,
  treatment: rawTreatment,
  vertical,
}) {
  const treatment = resolveTreatment(rawTreatment);
  const v = resolveVertical(vertical);
  const { origin, stateCode: resolvedStateCode } = await resolveOrigin({
    lat,
    lng,
    cep,
    city,
    stateCode,
  });

  // Mode 1: we have coordinates — use the nearby_hospitals RPC for distance-sorted results.
  if (origin.lat && origin.lng) {
    const rows = await hospitalRepo.findNearby({
      lat: origin.lat,
      lng: origin.lng,
      radiusM,
      stateCode: resolvedStateCode,
      treatment,
      limit,
      vertical: v,
    });
    return {
      origin,
      radius_m: radiusM,
      total_returned: rows.length,
      hospitals: rows.map((h) => ({
        ...h,
        distance_km: Math.round((h.distance_m / 1000) * 10) / 10,
      })),
    };
  }

  // Mode 2: city-based search (no distance ordering).
  const citySearch = (origin.source === 'cep_no_coords' && origin.cep && origin.cep.city) || city;
  if (!citySearch) {
    throw new ValidationError('Unable to determine a city for search');
  }

  const rows = await hospitalRepo.searchByCity({
    stateCode: resolvedStateCode,
    cityNormalized: normalizeCity(citySearch),
    treatment,
    limit,
    vertical: v,
  });
  return {
    origin: { ...origin, city_search: citySearch },
    total_returned: rows.length,
    hospitals: rows,
    notice: 'Results by city (not ordered by distance).',
  };
}

module.exports = {
  DEFAULT_VERTICAL,
  KNOWN_VERTICALS,
  resolveVertical,
  listStates,
  getState,
  listHospitals,
  getHospital,
  listNearbyHospitals,
  searchAcrossVerticals,
};
