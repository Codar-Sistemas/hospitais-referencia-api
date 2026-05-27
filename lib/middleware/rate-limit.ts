/**
 * IP-based rate limiter backed by Upstash Redis. Fail-open: if Upstash is
 * unreachable, requests pass through unthrottled — we'd rather be lax than
 * 503 the whole API on a Redis hiccup.
 */

import { isConfigured, pipeline } from '../core/redis.js';
import type { Response } from '../types/http.js';

export const RATE_LIMIT = 15; // requests per window
export const RATE_WINDOW = 60; // window length in seconds

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

const PERMISSIVE: RateLimitResult = {
  allowed: true,
  count: 0,
  remaining: RATE_LIMIT,
};

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  if (!isConfigured) return PERMISSIVE;

  const window = Math.floor(Date.now() / (RATE_WINDOW * 1000));
  const key = `rl:${ip}:${window}`;

  try {
    const result = await pipeline([
      ['INCR', key],
      ['EXPIRE', key, RATE_WINDOW],
    ]);
    if (!result || !result[0]) return PERMISSIVE;
    const raw = result[0].result;
    const count = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(count)) return PERMISSIVE;
    return {
      allowed: count <= RATE_LIMIT,
      count,
      remaining: Math.max(0, RATE_LIMIT - count),
    };
  } catch {
    return PERMISSIVE;
  }
}

export function applyRateHeaders(res: Response, rate: RateLimitResult): void {
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Window', `${RATE_WINDOW}s`);
}
