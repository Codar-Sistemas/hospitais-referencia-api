/**
 * JSON response helpers — set the canonical headers (Content-Type, CORS,
 * Cache-Control) and serialise the body in one call. All handlers go
 * through these helpers so the contract stays in one place.
 */

import type { Response } from '../types/http.js';

interface JsonOptions {
  cacheSeconds?: number;
}

export function json(
  res: Response,
  status: number,
  body: unknown,
  { cacheSeconds = 60 }: JsonOptions = {},
): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // `private`: browsers may cache, but Vercel's CDN must NOT — otherwise
  // every user IP would share the same rate-limit counter.
  res.setHeader('Cache-Control', status === 200 ? `private, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body));
}

export function error(res: Response, status: number, message: string): void {
  json(res, status, { error: { status, message } }, { cacheSeconds: 0 });
}
