import { normalizeRoute, track, type TrackParams } from '../core/metrics.js';
import type { Request, Response } from '../types/http.js';

export interface TrackerInput {
  req: Request;
  res: Response;
  ip: string;
  userAgent: string | null;
  startTime: number;
}

export type TrackerExtras = Partial<
  Omit<TrackParams, 'route' | 'method' | 'status' | 'duration_ms' | 'ip' | 'user_agent'>
>;

export type TrackerFn = (route: string, extras?: TrackerExtras) => void;

export function createTracker({ req, res, ip, userAgent, startTime }: TrackerInput): TrackerFn {
  return function trackRequest(route, extras = {}) {
    track({
      route: normalizeRoute(route),
      method: req.method ?? 'GET',
      status: res.statusCode,
      duration_ms: Date.now() - startTime,
      ip,
      user_agent: userAgent,
      ...extras,
    });
  };
}
