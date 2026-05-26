const { json } = require('../core/http');
const service = require('../services/hospital-service');
const { readParams, parseIntParam, parseFloatParam } = require('./_params');

async function listHospitals(req, res, url) {
  const { state_code, city, treatment } = readParams(
    url.searchParams,
    ['state_code', 'city', 'treatment'],
    res,
  );
  const q = url.searchParams.get('q') || null;
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 100, max: 500 });
  const offset = parseIntParam(url.searchParams.get('offset'), { fallback: 0 });

  const result = await service.listHospitals({
    stateCode: state_code ? state_code.toUpperCase() : null,
    city,
    treatment,
    q,
    limit,
    offset,
  });
  // Telemetry: search_origin reflects which filter the user supplied.
  res.metrics = {
    treatment_searched: result.filters?.treatment || null,
    search_origin: pickListOrigin({ state_code, city, q, treatment }),
    results_count: result.total_returned ?? null,
  };
  json(res, 200, result);
}

function pickListOrigin({ state_code, city, q, treatment }) {
  if (q) return 'q';
  if (city) return 'city';
  if (state_code) return 'state_code';
  if (treatment) return 'treatment';
  return null;
}

async function getHospital(req, res, id) {
  const row = await service.getHospital(id);
  json(res, 200, row);
}

async function listNearbyHospitals(req, res, url) {
  const { state_code, city, treatment, radius_m } = readParams(
    url.searchParams,
    ['state_code', 'city', 'treatment', 'radius_m'],
    res,
  );

  const lat = parseFloatParam(url.searchParams.get('lat'));
  const lng = parseFloatParam(url.searchParams.get('lng'));
  const cep = url.searchParams.get('cep') || null;
  const radiusM = parseIntParam(radius_m, { fallback: 50000, max: 200000 });
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 20, max: 100 });

  const result = await service.listNearbyHospitals({
    lat,
    lng,
    cep,
    city,
    stateCode: state_code ? state_code.toUpperCase() : null,
    radiusM,
    limit,
    treatment,
  });
  // origin.source from the service tells us how coords were derived.
  res.metrics = {
    treatment_searched: treatment || null,
    search_origin: result.origin?.source || null,
    user_state_code: result.origin?.user_state_code || null,
    results_count: result.total_returned ?? null,
  };
  json(res, 200, result);
}

module.exports = { listHospitals, getHospital, listNearbyHospitals };
