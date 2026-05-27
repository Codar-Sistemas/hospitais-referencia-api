/**
 * CORS — the API is fully public, so we expose it to any origin. Only
 * `GET` and `POST` are wired up (preflight responds the same way).
 */

import type { Request, Response } from '../types/http.js';

export function applyCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

/**
 * Short-circuits OPTIONS preflight requests with a 204 + CORS headers,
 * returning `true` to signal the caller that no further processing is
 * required. Returns `false` for any non-OPTIONS request.
 */
export function handlePreflight(req: Request, res: Response): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(res);
  res.statusCode = 204;
  res.end();
  return true;
}
