const { json } = require('../core/http');
const service = require('../services/hospital-service');
const { readParams, parseIntParam, parseFloatParam } = require('./_params');

// `ctx.vertical` is injected by api/index.js when the request path matches
// `/v1/{vertical}/...`. Legacy paths (`/v1/hospitals`) leave it unset and
// the service layer defaults to 'peconhentos' for backwards compatibility.

async function listHospitals(req, res, url, ctx = {}) {
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
    vertical: ctx.vertical,
  });
  res.metrics = {
    treatment_searched: result.filters?.treatment || null,
    search_origin: pickListOrigin({ state_code, city, q, treatment }),
    results_count: result.total_returned ?? null,
    vertical: result.filters?.vertical || null,
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

async function getHospital(req, res, id, ctx = {}) {
  const row = await service.getHospital(id, { vertical: ctx.vertical });
  json(res, 200, row);
}

async function listNearbyHospitals(req, res, url, ctx = {}) {
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
    vertical: ctx.vertical,
  });
  res.metrics = {
    treatment_searched: treatment || null,
    search_origin: result.origin?.source || null,
    user_state_code: result.origin?.user_state_code || null,
    results_count: result.total_returned ?? null,
    vertical: ctx.vertical || null,
  };
  json(res, 200, result);
}

// Cross-vertical search — backed by v_hospitals_all. The frontend uses
// this from the MapaSUS hub when the user doesn't pre-filter by vertical.
async function searchAcrossVerticals(req, res, url) {
  const { state_code, city } = readParams(url.searchParams, ['state_code', 'city'], res);
  const q = url.searchParams.get('q') || null;
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 50, max: 200 });
  const offset = parseIntParam(url.searchParams.get('offset'), { fallback: 0 });

  const result = await service.searchAcrossVerticals({
    stateCode: state_code ? state_code.toUpperCase() : null,
    city,
    q,
    limit,
    offset,
  });
  res.metrics = {
    search_origin: q ? 'q' : city ? 'city' : 'state_code',
    results_count: result.total_returned ?? null,
    vertical: 'all',
  };
  json(res, 200, result);
}

module.exports = { listHospitals, getHospital, listNearbyHospitals, searchAcrossVerticals };
