/**
 * Observability — records each request into the api_metrics table.
 *
 * Fire-and-forget: the call never blocks nor fails the API response.
 * If Supabase is down, that request's metric is lost — a conscious tradeoff
 * (observable logs, not an audit trail).
 *
 * IP is stored as a truncated SHA-256 (LGPD anonymization).
 */

const crypto = require('crypto');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, REST_BASE } = require('./supabase');

// Fixed salt (via env) — guarantees the same IP always produces the same hash,
// but it cannot be reversed without the salt. Set a random value in Vercel.
const IP_SALT = process.env.METRICS_IP_SALT || 'hospitais-referencia-default-salt';

function hashIp(ip) {
  if (!ip || ip === 'unknown') return null;
  return crypto
    .createHash('sha256')
    .update(IP_SALT + ip)
    .digest('hex')
    .substring(0, 16);
}

function track(params) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const body = {
    route: params.route,
    method: params.method || 'GET',
    status: params.status,
    duration_ms: params.duration_ms ?? null,
    ip_hash: hashIp(params.ip),
    user_agent: params.user_agent ? String(params.user_agent).substring(0, 256) : null,
    state_code: params.state_code || null,
    cache_hit: typeof params.cache_hit === 'boolean' ? params.cache_hit : null,
    rate_limited: !!params.rate_limited,
    error_type: params.error_type || null,
    error_message: params.error_message ? String(params.error_message).substring(0, 500) : null,
    // Phase 1 enriched fields — all optional.
    treatment_searched: params.treatment_searched || null,
    search_origin: params.search_origin || null,
    user_state_code: params.user_state_code || null,
    results_count: typeof params.results_count === 'number' ? params.results_count : null,
    gov_br_unreachable:
      typeof params.gov_br_unreachable === 'boolean' ? params.gov_br_unreachable : null,
  };

  fetch(`${REST_BASE}/api_metrics`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('[metrics] failed to record metric:', err.message);
  });
}

// Persists a single web_events row. Same fire-and-forget contract as track().
function trackWebEvent(event) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const body = {
    event_type: event.event_type,
    session_id: event.session_id || null,
    ip_hash: hashIp(event.ip),
    user_agent: event.user_agent ? String(event.user_agent).substring(0, 256) : null,
    referrer: event.referrer ? String(event.referrer).substring(0, 512) : null,
    path: event.path || null,
    state_code: event.state_code || null,
    treatment: event.treatment || null,
    payload: event.payload || null,
  };

  fetch(`${REST_BASE}/web_events`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('[metrics] failed to record web event:', err.message);
  });
}

// Normalize a route for analytics — replace dynamic IDs with placeholders.
//   '/v1/hospitals/42' → '/v1/hospitals/:id'
//   '/v1/states/SP'    → '/v1/states/:state_code'
function normalizeRoute(path) {
  return path
    .replace(/^\/+|\/+$/g, '/')
    .replace(/\/v1\/hospitals\/\d+$/, '/v1/hospitals/:id')
    .replace(/\/v1\/states\/[A-Za-z]{2}$/, '/v1/states/:state_code');
}

module.exports = { track, trackWebEvent, normalizeRoute };
