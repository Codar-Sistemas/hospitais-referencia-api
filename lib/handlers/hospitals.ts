/**
 * Hospital endpoints — thin HTTP adapters around the hospital-service.
 *
 * `ctx.vertical` is injected by api/index.ts when the request path matches
 * `/v1/{vertical}/...`. Legacy paths (`/v1/hospitals`) leave it `null` and
 * the service layer defaults to 'animais_peconhentos' for backward
 * compatibility.
 */

import { json } from '../core/http.js';
import * as service from '../services/hospital-service.js';
import type { RequestContext, Request, ResponseWithMetrics } from '../types/http.js';
import type { StateCode } from '../types/domain.js';
import { parseFloatParam, parseIntParam, readParams } from './_params.js';

function pickListOrigin({
  state_code,
  city,
  q,
  treatment,
}: {
  state_code: string | null;
  city: string | null;
  q: string | null;
  treatment: string | null;
}): 'q' | 'city' | 'state_code' | 'treatment' | null {
  if (q) return 'q';
  if (city) return 'city';
  if (state_code) return 'state_code';
  if (treatment) return 'treatment';
  return null;
}

export async function listHospitals(
  _req: Request,
  res: ResponseWithMetrics,
  url: URL,
  ctx: RequestContext = { ip: 'unknown', userAgent: null, vertical: null },
): Promise<void> {
  const { state_code, city, treatment } = readParams(
    url.searchParams,
    ['state_code', 'city', 'treatment'] as const,
    res,
  );
  const q = url.searchParams.get('q');
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 100, max: 500 });
  const offset = parseIntParam(url.searchParams.get('offset'), { fallback: 0 });

  const result = await service.listHospitals({
    stateCode: state_code ? (state_code.toUpperCase() as StateCode) : null,
    city,
    treatment,
    q,
    limit,
    offset,
    vertical: ctx.vertical,
  });
  res.metrics = {
    treatment_searched: result.filters.treatment ?? null,
    search_origin: pickListOrigin({ state_code, city, q, treatment }),
    results_count: result.total_returned,
    vertical: result.filters.vertical,
  };
  json(res, 200, result);
}

export async function getHospital(
  _req: Request,
  res: ResponseWithMetrics,
  id: string,
  ctx: RequestContext = { ip: 'unknown', userAgent: null, vertical: null },
): Promise<void> {
  const row = await service.getHospital(id, { vertical: ctx.vertical });
  json(res, 200, row);
}

export async function listNearbyHospitals(
  _req: Request,
  res: ResponseWithMetrics,
  url: URL,
  ctx: RequestContext = { ip: 'unknown', userAgent: null, vertical: null },
): Promise<void> {
  const { state_code, city, treatment, radius_m } = readParams(
    url.searchParams,
    ['state_code', 'city', 'treatment', 'radius_m'] as const,
    res,
  );

  const lat = parseFloatParam(url.searchParams.get('lat'));
  const lng = parseFloatParam(url.searchParams.get('lng'));
  const cep = url.searchParams.get('cep');
  const radiusM = parseIntParam(radius_m, { fallback: 50000, max: 200000 });
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 20, max: 100 });

  const result = await service.listNearbyHospitals({
    lat,
    lng,
    cep,
    city,
    stateCode: state_code ? (state_code.toUpperCase() as StateCode) : null,
    radiusM,
    limit,
    treatment,
    vertical: ctx.vertical,
  });
  // `user_state_code` only exists on origin branches that came from a CEP
  // lookup — narrow with `in` so TS doesn't trip on the 'coords'/'city'
  // variants that never carry it.
  const userStateCode = 'user_state_code' in result.origin ? result.origin.user_state_code : null;
  res.metrics = {
    treatment_searched: treatment,
    search_origin: result.origin.source,
    user_state_code: userStateCode,
    results_count: result.total_returned,
    vertical: ctx.vertical,
  };
  json(res, 200, result);
}

/**
 * Cross-vertical search — backed by `v_hospitals_all`. The MapaSUS hub
 * calls this when the user hasn't pre-filtered by vertical.
 */
export async function searchAcrossVerticals(
  _req: Request,
  res: ResponseWithMetrics,
  url: URL,
): Promise<void> {
  const { state_code, city } = readParams(url.searchParams, ['state_code', 'city'] as const, res);
  const q = url.searchParams.get('q');
  const limit = parseIntParam(url.searchParams.get('limit'), { fallback: 50, max: 200 });
  const offset = parseIntParam(url.searchParams.get('offset'), { fallback: 0 });

  const result = await service.searchAcrossVerticals({
    stateCode: state_code ? (state_code.toUpperCase() as StateCode) : null,
    city,
    q,
    limit,
    offset,
  });
  res.metrics = {
    search_origin: q ? 'q' : city ? 'city' : 'state_code',
    results_count: result.total_returned,
    vertical: 'all',
  };
  json(res, 200, result);
}
