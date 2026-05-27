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
  // `private` (not `public`): the Vercel CDN must not share a response
  // across IPs, otherwise the rate-limit counter becomes meaningless.
  res.setHeader('Cache-Control', status === 200 ? `private, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body));
}

export function error(res: Response, status: number, message: string): void {
  json(res, status, { error: { status, message } }, { cacheSeconds: 0 });
}
