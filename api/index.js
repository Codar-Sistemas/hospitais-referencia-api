/**
 * Public API — Reference hospitals for venomous-animal accidents.
 * Vercel serverless entry. All real work lives in handlers/services/repositories.
 */

const { error } = require('../lib/core/http');
const { ApiError } = require('../lib/core/errors');
const { handlePreflight } = require('../lib/middleware/cors');
const {
  checkRateLimit,
  applyRateHeaders,
  RATE_LIMIT,
  RATE_WINDOW,
} = require('../lib/middleware/rate-limit');
const { createTracker } = require('../lib/middleware/metrics');
const states = require('../lib/handlers/states');
const hospitals = require('../lib/handlers/hospitals');
const metadata = require('../lib/handlers/metadata');
const track = require('../lib/handlers/track');
const stats = require('../lib/handlers/stats');

const STATE_PATH = /^\/v1\/states\/([A-Za-z]{2})$/;
const HOSPITAL_PATH = /^\/v1\/hospitals\/(\d+)$/;

// MapaSUS multi-vertical routing.
//
// Paths under `/v1/{vertical}/...` (e.g. `/v1/peconhentos/hospitals`,
// `/v1/raras/hospitals/nearby`) are rewritten internally to the legacy
// `/v1/...` shape with `ctx.vertical` set, so the dispatch table stays
// flat. Legacy `/v1/hospitals` paths keep working as aliases — handlers
// fall back to the default vertical ('peconhentos') when ctx.vertical
// is unset, preserving backward compatibility for every integration
// built against the pre-MapaSUS API.
//
// Keep this regex in sync with KNOWN_VERTICALS in hospital-service.js.
const VERTICAL_PREFIX = /^\/v1\/(peconhentos|raras|oncologia)(\/.*)?$/;

// Paths that accept POST (everything else is GET-only).
const POST_ROUTES = new Set(['/v1/track']);

function isAllowedMethod(method, path) {
  if (method === 'GET') return true;
  if (method === 'POST' && POST_ROUTES.has(path)) return true;
  return false;
}

// Strip a `/v1/{vertical}` prefix and return `{ path, vertical }`.
// Legacy paths come back with vertical=null and the original path.
function normalizePath(rawPath) {
  const m = rawPath.match(VERTICAL_PREFIX);
  if (!m) return { path: rawPath, vertical: null };
  const inner = m[2] || '';
  return { path: `/v1${inner}`, vertical: m[1] };
}

async function dispatch(req, res, url, ctx) {
  const rawPath = url.pathname.replace(/\/+$/, '');
  const { path, vertical } = normalizePath(rawPath);
  ctx.vertical = vertical; // null on legacy paths → service defaults to peconhentos

  if (path === '/v1/track') return track.postTrack(req, res, ctx.ip, ctx.userAgent);

  if (path === '' || path === '/' || path === '/v1') return metadata.getMetadata(req, res);
  if (path === '/v1/stats') return stats.getStats(req, res);
  if (path === '/v1/states') return states.listStates(req, res);
  if (path === '/v1/search') return hospitals.searchAcrossVerticals(req, res, url);
  if (path === '/v1/hospitals') return hospitals.listHospitals(req, res, url, ctx);
  if (path === '/v1/hospitals/nearby') return hospitals.listNearbyHospitals(req, res, url, ctx);

  const stateMatch = path.match(STATE_PATH);
  if (stateMatch) return states.getState(req, res, stateMatch[1].toUpperCase());

  const hospitalMatch = path.match(HOSPITAL_PATH);
  if (hospitalMatch) return hospitals.getHospital(req, res, hospitalMatch[1], ctx);

  throw new ApiError(404, `Route not found: ${rawPath}`, 'not_found');
}

module.exports = async (req, res) => {
  const startTime = Date.now();
  if (handlePreflight(req, res)) return;

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';
  const userAgent = req.headers['user-agent'] || null;
  const trackRequest = createTracker({ req, res, ip, userAgent, startTime });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname.replace(/\/+$/, '') || '/';
  // Strip any /v1/{vertical} prefix before matching telemetry patterns so
  // /v1/peconhentos/states/SP captures state_code = SP just like /v1/states/SP.
  const { path } = normalizePath(rawPath);
  const stateMatch = path.match(STATE_PATH);
  const capturedStateCode = stateMatch
    ? stateMatch[1].toUpperCase()
    : url.searchParams.get('state_code') || url.searchParams.get('uf');

  if (!isAllowedMethod(req.method, path)) {
    error(res, 405, 'Method not allowed');
    return trackRequest(path, { error_type: 'method_not_allowed' });
  }

  const rate = await checkRateLimit(ip);
  applyRateHeaders(res, rate);
  if (!rate.allowed) {
    res.setHeader('Retry-After', RATE_WINDOW);
    error(
      res,
      429,
      `Rate limit of ${RATE_LIMIT} requests per ${RATE_WINDOW}s exceeded. ` +
        `Wait and try again. Tip: cache responses in your application.`,
    );
    return trackRequest(path, { rate_limited: true, error_type: 'rate_limit' });
  }

  try {
    await dispatch(req, res, url, { ip, userAgent });
    // Handlers attach search context to res.metrics when applicable.
    trackRequest(path, {
      state_code: capturedStateCode,
      error_type: res.statusCode >= 400 ? `http_${res.statusCode}` : null,
      ...(res.metrics || {}),
    });
  } catch (e) {
    if (!res.writableEnded) {
      const status = e instanceof ApiError ? e.status : 500;
      const message = e instanceof ApiError ? e.message : e.message || 'Internal error';
      error(res, status, message);
    }
    if (!(e instanceof ApiError) || e.status >= 500) console.error(e);
    trackRequest(path, {
      state_code: capturedStateCode,
      error_type: e instanceof ApiError ? e.type : 'exception',
      error_message: e.message,
    });
  }
};
