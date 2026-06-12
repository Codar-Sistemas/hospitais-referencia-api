// HTTP types shared by the Vercel handler and the dev-server wrapper.
// Re-using `@vercel/node` keeps production and dev on the same surface.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Vertical } from './domain.js';

export type Request = VercelRequest;
export type Response = VercelResponse;

// Cross-cutting per-request data injected by api/index.ts so handler
// signatures stay focused on the actual operation.
export interface RequestContext {
  ip: string;
  userAgent: string | null;
  // `null` on legacy paths — the service layer applies the default vertical.
  vertical: Vertical | null;
}

// Handlers attach per-request analytics to `res.metrics`; the metrics
// middleware drains it after the response is sent.
export interface ResponseMetrics {
  treatment_searched?: string | null;
  /** Disease-area filter searched (rare diseases, oncology) — the `?disease=`
   * counterpart of `treatment_searched`, null on the venomous vertical. */
  disease_searched?: string | null;
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

export interface ResponseWithMetrics extends Response {
  metrics?: ResponseMetrics;
}
