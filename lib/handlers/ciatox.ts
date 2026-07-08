import { json } from '../core/http.js';
import * as service from '../services/ciatox-service.js';
import type { Request, Response } from '../types/http.js';

// The directory changes at most once a day (daily sync) — a longer CDN
// TTL than the default 60s is safe and shields Supabase from bursts.
const CACHE_SECONDS = 300;

export async function listCenters(_req: Request, res: Response): Promise<void> {
  json(res, 200, await service.listCenters(), { cacheSeconds: CACHE_SECONDS });
}

export async function getCentersByState(
  _req: Request,
  res: Response,
  stateCode: string,
): Promise<void> {
  json(res, 200, await service.getCentersByState(stateCode), { cacheSeconds: CACHE_SECONDS });
}
