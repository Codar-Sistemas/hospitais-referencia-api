// Vercel serverless entry. Per-request flow: CORS preflight → identity
// (IP/UA) → path normalisation → method allowlist → rate limit →
// dispatch → fire-and-forget metrics. Real work lives downstream.

import { ApiError } from '../lib/core/errors.js';
import { error } from '../lib/core/http.js';
import * as ciatox from '../lib/handlers/ciatox.js';
import * as hospitals from '../lib/handlers/hospitals.js';
import * as metadata from '../lib/handlers/metadata.js';
import * as states from '../lib/handlers/states.js';
import * as stats from '../lib/handlers/stats.js';
import * as track from '../lib/handlers/track.js';
import { handlePreflight } from '../lib/middleware/cors.js';
import { createTracker } from '../lib/middleware/metrics.js';
import {
  applyRateHeaders,
  checkRateLimit,
  RATE_LIMIT,
  RATE_WINDOW,
} from '../lib/middleware/rate-limit.js';
import type { Vertical } from '../lib/types/domain.js';
import type { Request, RequestContext, ResponseWithMetrics } from '../lib/types/http.js';

const STATE_PATH = /^\/v1\/states\/([A-Za-z]{2})$/;
const HOSPITAL_PATH = /^\/v1\/hospitals\/(\d+)$/;
const CIATOX_PATH = /^\/v1\/ciatox\/([A-Za-z]{2})$/;

// Multi-vertical routing. `/v1/{vertical}/...` paths are rewritten
// internally to the flat `/v1/...` dispatch table with `ctx.vertical`
// pre-filled. Legacy paths fall through unchanged. URL is kebab-case,
// DB key is snake_case — this map is the one place that bridges the two.
// Keep it in sync with `KNOWN_VERTICALS` in hospital-service.ts.
const URL_TO_DB_VERTICAL: Readonly<Record<string, Vertical>> = {
  'venomous-animals': 'venomous_animals',
  'rare-diseases': 'rare_diseases',
  oncology: 'oncology',
  'mental-health': 'mental_health',
};
const VERTICAL_PREFIX = new RegExp(`^/v1/(${Object.keys(URL_TO_DB_VERTICAL).join('|')})(/.*)?$`);

const POST_ROUTES = new Set(['/v1/track']);

function isAllowedMethod(method: string | undefined, path: string): boolean {
  if (method === 'GET') return true;
  if (method === 'POST' && POST_ROUTES.has(path)) return true;
  return false;
}

interface NormalizedPath {
  path: string;
  vertical: Vertical | null;
}

function normalizePath(rawPath: string): NormalizedPath {
  const m = rawPath.match(VERTICAL_PREFIX);
  if (!m) return { path: rawPath, vertical: null };
  const verticalKey = m[1];
  const inner = m[2] ?? '';
  if (!verticalKey) return { path: rawPath, vertical: null };
  return { path: `/v1${inner}`, vertical: URL_TO_DB_VERTICAL[verticalKey] ?? null };
}

async function dispatch(
  req: Request,
  res: ResponseWithMetrics,
  url: URL,
  ctx: RequestContext,
): Promise<void> {
  const rawPath = url.pathname.replace(/\/+$/, '');
  const { path, vertical } = normalizePath(rawPath);
  ctx.vertical = vertical;

  if (path === '/v1/track') return track.postTrack(req, res, ctx.ip, ctx.userAgent);

  if (path === '' || path === '/' || path === '/v1') return metadata.getMetadata(req, res);
  if (path === '/v1/stats') return stats.getStats(req, res);
  if (path === '/v1/states') return states.listStates(req, res);
  if (path === '/v1/ciatox') return ciatox.listCenters(req, res);
  if (path === '/v1/search') return hospitals.searchAcrossVerticals(req, res, url);
  if (path === '/v1/hospitals') return hospitals.listHospitals(req, res, url, ctx);
  if (path === '/v1/hospitals/nearby') return hospitals.listNearbyHospitals(req, res, url, ctx);

  const stateMatch = STATE_PATH.exec(path);
  if (stateMatch?.[1]) return states.getState(req, res, stateMatch[1].toUpperCase());

  const ciatoxMatch = CIATOX_PATH.exec(path);
  if (ciatoxMatch?.[1]) return ciatox.getCentersByState(req, res, ciatoxMatch[1]);

  const hospitalMatch = HOSPITAL_PATH.exec(path);
  if (hospitalMatch?.[1]) return hospitals.getHospital(req, res, hospitalMatch[1], ctx);

  throw new ApiError(404, `Route not found: ${rawPath}`, 'not_found');
}

function resolveIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]
        : null;
  const realIp = req.headers['x-real-ip'];
  const realIpStr = typeof realIp === 'string' ? realIp : null;
  return firstForwarded || realIpStr || req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req: Request, res: ResponseWithMetrics): Promise<void> {
  const startTime = Date.now();
  if (handlePreflight(req, res)) return;

  const ip = resolveIp(req);
  const userAgentHeader = req.headers['user-agent'];
  const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : null;
  const trackRequest = createTracker({ req, res, ip, userAgent, startTime });

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const rawPath = url.pathname.replace(/\/+$/, '') || '/';
  // Strip the vertical prefix so the telemetry STATE_PATH regex matches
  // /v1/venomous-animals/states/SP the same as /v1/states/SP.
  const { path } = normalizePath(rawPath);
  const stateMatch = STATE_PATH.exec(path) ?? CIATOX_PATH.exec(path);
  const capturedStateCode =
    stateMatch?.[1]?.toUpperCase() ??
    url.searchParams.get('state_code') ??
    url.searchParams.get('uf');

  if (!isAllowedMethod(req.method, path)) {
    error(res, 405, 'Method not allowed');
    return trackRequest(path, { error_type: 'method_not_allowed' });
  }

  const rate = await checkRateLimit(ip);
  applyRateHeaders(res, rate);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(RATE_WINDOW));
    error(
      res,
      429,
      `Rate limit of ${RATE_LIMIT} requests per ${RATE_WINDOW}s exceeded. ` +
        `Wait and try again. Tip: cache responses in your application.`,
    );
    return trackRequest(path, { rate_limited: true, error_type: 'rate_limit' });
  }

  const ctx: RequestContext = { ip, userAgent, vertical: null };

  try {
    await dispatch(req, res, url, ctx);
    trackRequest(path, {
      state_code: capturedStateCode,
      error_type: res.statusCode >= 400 ? `http_${res.statusCode}` : null,
      ...(res.metrics ?? {}),
    });
  } catch (e: unknown) {
    const apiErr = e instanceof ApiError ? e : null;
    const status = apiErr?.status ?? 500;
    const message = apiErr?.message ?? (e instanceof Error ? e.message : 'Internal error');
    if (!res.writableEnded) error(res, status, message);
    if (!apiErr || apiErr.status >= 500) console.error(e);
    trackRequest(path, {
      state_code: capturedStateCode,
      error_type: apiErr ? apiErr.type : 'exception',
      error_message: e instanceof Error ? e.message : String(e),
    });
  }
}
