// Fire-and-forget. If Supabase is down the metric is lost — this is
// observability, not an audit trail. IP stored as truncated SHA-256 (LGPD).

import crypto from 'node:crypto';
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, REST_BASE } from './supabase.js';

// The salt is fixed (per environment) so the same IP always hashes to the
// same value — needed for "unique users" aggregations. Set a random
// METRICS_IP_SALT in Vercel; the fallback below is intentionally weak so
// dev environments don't accidentally collide with production hashes.
const IP_SALT: string = process.env['METRICS_IP_SALT'] ?? 'hospitais-referencia-default-salt';

export interface TrackParams {
  route: string;
  method?: string;
  status: number;
  duration_ms?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  state_code?: string | null;
  cache_hit?: boolean | null;
  rate_limited?: boolean;
  error_type?: string | null;
  error_message?: string | null;

  treatment_searched?: string | null;
  search_origin?: string | null;
  user_state_code?: string | null;
  results_count?: number | null;
  gov_br_unreachable?: boolean | null;
  vertical?: string | null;
}

export interface WebEventParams {
  event_type: string;
  session_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  referrer?: string | null;
  path?: string | null;
  state_code?: string | null;
  treatment?: string | null;
  payload?: Record<string, unknown> | null;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip || ip === 'unknown') return null;
  return crypto
    .createHash('sha256')
    .update(IP_SALT + ip)
    .digest('hex')
    .substring(0, 16);
}

function truncate(s: string | null | undefined, max: number): string | null {
  if (s === null || s === undefined) return null;
  return String(s).substring(0, max);
}

export function track(params: TrackParams): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const body = {
    route: params.route,
    method: params.method ?? 'GET',
    status: params.status,
    duration_ms: params.duration_ms ?? null,
    ip_hash: hashIp(params.ip),
    user_agent: truncate(params.user_agent, 256),
    state_code: params.state_code ?? null,
    cache_hit: typeof params.cache_hit === 'boolean' ? params.cache_hit : null,
    rate_limited: Boolean(params.rate_limited),
    error_type: params.error_type ?? null,
    error_message: truncate(params.error_message, 500),
    treatment_searched: params.treatment_searched ?? null,
    search_origin: params.search_origin ?? null,
    user_state_code: params.user_state_code ?? null,
    results_count: typeof params.results_count === 'number' ? params.results_count : null,
    gov_br_unreachable:
      typeof params.gov_br_unreachable === 'boolean' ? params.gov_br_unreachable : null,
    vertical: params.vertical ?? null,
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
  }).catch((err: unknown) => {
    console.error('[metrics] failed to record metric:', err instanceof Error ? err.message : err);
  });
}

export function trackWebEvent(event: WebEventParams): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const body = {
    event_type: event.event_type,
    session_id: event.session_id ?? null,
    ip_hash: hashIp(event.ip),
    user_agent: truncate(event.user_agent, 256),
    referrer: truncate(event.referrer, 512),
    path: event.path ?? null,
    state_code: event.state_code ?? null,
    treatment: event.treatment ?? null,
    payload: event.payload ?? null,
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
  }).catch((err: unknown) => {
    console.error(
      '[metrics] failed to record web event:',
      err instanceof Error ? err.message : err,
    );
  });
}

// Collapses dynamic segments so dashboards can group by template:
//   /v1/hospitals/42 → /v1/hospitals/:id
//   /v1/states/SP    → /v1/states/:state_code
export function normalizeRoute(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, '/')
    .replace(/\/v1\/hospitals\/\d+$/, '/v1/hospitals/:id')
    .replace(/\/v1\/states\/[A-Za-z]{2}$/, '/v1/states/:state_code');
}
