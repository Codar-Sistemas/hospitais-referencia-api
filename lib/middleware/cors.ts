// The API is fully public; any origin is allowed.

import type { Request, Response } from '../types/http.js';

export function applyCors(res: Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

// Returns true when the request was a preflight and has been answered.
export function handlePreflight(req: Request, res: Response): boolean {
  if (req.method !== 'OPTIONS') return false;
  applyCors(res);
  res.statusCode = 204;
  res.end();
  return true;
}
