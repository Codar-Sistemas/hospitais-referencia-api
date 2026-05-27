/**
 * HTTP request/response types shared by the Vercel handler and the local
 * dev-server wrapper. We use Vercel's canonical types so production and
 * dev share the exact same surface area.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Vertical } from './domain.js';

export type Request = VercelRequest;
export type Response = VercelResponse;

/**
 * Context object injected by the router (`api/index.ts`) and consumed by
 * the handler functions. Carries cross-cutting metadata that should not
 * pollute the function signatures.
 */
export interface RequestContext {
  /** Caller IP — first valid value of x-forwarded-for / x-real-ip / socket. */
  ip: string;
  /** Browser User-Agent header (or null when missing). */
  userAgent: string | null;
  /**
   * Vertical extracted from the URL prefix (e.g. `/v1/animais-peconhentos/...`).
   * `null` on legacy paths — the service layer falls back to the default.
   */
  vertical: Vertical | null;
}

/**
 * Handlers can attach per-request analytics fields to `res.metrics`. The
 * metrics middleware reads this after the response is sent and persists it
 * along with the standard request metadata.
 */
export interface ResponseMetrics {
  treatment_searched?: string | null;
  search_origin?:
    | 'q'
    | 'city'
    | 'state_code'
    | 'treatment'
    | 'cep'
    | 'coords'
    | 'cep_no_coords'
    | null;
  user_state_code?: string | null;
  results_count?: number | null;
  vertical?: string | null;
  cache_hit?: boolean | null;
  gov_br_unreachable?: boolean | null;
}

/**
 * Augments `VercelResponse` with the optional `metrics` field so handlers
 * can populate it without TypeScript complaining about unknown properties.
 */
export interface ResponseWithMetrics extends Response {
  metrics?: ResponseMetrics;
}
