const { sb, sbRpc } = require('../core/supabase');

const HOSPITAL_LIST_COLUMNS =
  'id,state_code,city,name,address,phones,cnes,treatments,lat,lng,extraction_source,ocr_confidence,requires_verification,verticals';

// Default vertical for backwards compatibility — every legacy API call
// (the public /v1/hospitals routes from the pre-MapaSUS era) implicitly
// expects to see the venomous-animal hospitals. Phase 2 ships the new
// /v1/{vertical}/hospitals routes that pass `vertical` explicitly.
const DEFAULT_VERTICAL = 'peconhentos';

function verticalFilter(vertical) {
  // Pass `null` (or `'all'`) to disable the filter and search across
  // every vertical. Used by the cross-vertical `/v1/search` endpoint.
  if (vertical === null || vertical === 'all') return null;
  // PostgREST contains-array syntax: verticals @> '{peconhentos}'
  return `cs.{"${vertical || DEFAULT_VERTICAL}"}`;
}

async function search({
  stateCode,
  cityNormalized,
  treatment,
  q,
  limit,
  offset,
  vertical = DEFAULT_VERTICAL,
}) {
  const params = {
    select: HOSPITAL_LIST_COLUMNS,
    order: 'city.asc,name.asc',
    limit: String(limit),
    offset: String(offset),
  };
  const vf = verticalFilter(vertical);
  if (vf) params.verticals = vf;
  if (stateCode) params.state_code = `eq.${stateCode}`;
  if (cityNormalized) params.city_normalized = `ilike.*${cityNormalized}*`;
  if (treatment) params.treatments = `cs.{"${treatment}"}`;
  if (q) params.or = `(name.ilike.*${q}*,address.ilike.*${q}*)`;
  return sb('hospitals', params);
}

async function searchByCity({
  stateCode,
  cityNormalized,
  treatment,
  limit,
  vertical = DEFAULT_VERTICAL,
}) {
  const params = {
    select: HOSPITAL_LIST_COLUMNS,
    city_normalized: `ilike.*${cityNormalized}*`,
    order: 'city.asc,name.asc',
    limit: String(limit),
  };
  const vf = verticalFilter(vertical);
  if (vf) params.verticals = vf;
  if (stateCode) params.state_code = `eq.${stateCode}`;
  if (treatment) params.treatments = `cs.{"${treatment}"}`;
  return sb('hospitals', params);
}

async function findById(id, { vertical } = {}) {
  // Single-record lookup. Caller can constrain by vertical if they
  // explicitly want to deny cross-vertical access (e.g. peconhentos
  // page must not surface an oncology-only hospital), or pass null
  // to allow any.
  const params = { select: '*', id: `eq.${id}` };
  const vf = verticalFilter(vertical === undefined ? null : vertical);
  if (vf) params.verticals = vf;
  const rows = await sb('hospitals', params);
  return rows[0] || null;
}

async function findNearby({
  lat,
  lng,
  radiusM,
  stateCode,
  treatment,
  limit,
  vertical = DEFAULT_VERTICAL,
}) {
  return sbRpc('nearby_hospitals', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_state_code: stateCode,
    p_treatment: treatment,
    p_limit: limit,
    // Pass null/undefined to disable the vertical filter (cross-vertical search).
    p_vertical: vertical === 'all' ? null : vertical,
  });
}

// Cross-vertical convenience query — backed by the v_hospitals_all view.
// Returns hospitals annotated with their full set of active verticals
// and specialties, so the frontend can render badges like
// "peçonhentos + oncologia" without an extra round-trip.
async function searchAcrossVerticals({ stateCode, cityNormalized, q, limit, offset }) {
  const params = {
    select:
      'id,state_code,city,name,address,phones,cnes,lat,lng,active_verticals,active_specialties',
    order: 'city.asc,name.asc',
    limit: String(limit),
    offset: String(offset),
  };
  if (stateCode) params.state_code = `eq.${stateCode}`;
  if (cityNormalized) params.city_normalized = `ilike.*${cityNormalized}*`;
  if (q) params.or = `(name.ilike.*${q}*,address.ilike.*${q}*)`;
  // Only include hospitals that are active in at least one vertical.
  params.active_verticals = 'not.eq.{}';
  return sb('v_hospitals_all', params);
}

module.exports = {
  DEFAULT_VERTICAL,
  search,
  searchByCity,
  findById,
  findNearby,
  searchAcrossVerticals,
};
