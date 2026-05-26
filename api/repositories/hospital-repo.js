const { sb, sbRpc } = require('../lib/supabase');

const HOSPITAL_LIST_COLUMNS =
  'id,state_code,city,name,address,phones,cnes,treatments,lat,lng,extraction_source,ocr_confidence,requires_verification';

async function search({ stateCode, cityNormalized, treatment, q, limit, offset }) {
  const params = {
    select: HOSPITAL_LIST_COLUMNS,
    order: 'city.asc,name.asc',
    limit: String(limit),
    offset: String(offset),
  };
  if (stateCode) params.state_code = `eq.${stateCode}`;
  if (cityNormalized) params.city_normalized = `ilike.*${cityNormalized}*`;
  if (treatment) params.treatments = `cs.{"${treatment}"}`;
  if (q) params.or = `(name.ilike.*${q}*,address.ilike.*${q}*)`;
  return sb('hospitals', params);
}

async function searchByCity({ stateCode, cityNormalized, treatment, limit }) {
  const params = {
    select: HOSPITAL_LIST_COLUMNS,
    city_normalized: `ilike.*${cityNormalized}*`,
    order: 'city.asc,name.asc',
    limit: String(limit),
  };
  if (stateCode) params.state_code = `eq.${stateCode}`;
  if (treatment) params.treatments = `cs.{"${treatment}"}`;
  return sb('hospitals', params);
}

async function findById(id) {
  const rows = await sb('hospitals', { select: '*', id: `eq.${id}` });
  return rows[0] || null;
}

async function findNearby({ lat, lng, radiusM, stateCode, treatment, limit }) {
  return sbRpc('nearby_hospitals', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_state_code: stateCode,
    p_treatment: treatment,
    p_limit: limit,
  });
}

module.exports = { search, searchByCity, findById, findNearby };
