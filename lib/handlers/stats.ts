// Queries the read-only views from sql/008_metrics_phase1.sql.
// No PII; safe for CDN caching.

import { json } from '../core/http.js';
import { sb } from '../core/supabase.js';
import type { Request, Response } from '../types/http.js';

interface OverviewRow {
  total_searches: number;
  unique_users: number;
  avg_results: number;
  cache_hit_rate: number;
}
interface DemandRow {
  user_state_code: string | null;
  searches: number;
}
interface TreatmentPopularityRow {
  treatment: string;
  searches: number;
}
interface SearchTimelineRow {
  day: string;
  searches: number;
}
interface SyncResilienceRow {
  total_runs: number;
  failed_runs: number;
  uptime_pct: number;
}
interface CoverageRow {
  state_code: string;
  total_hospitals: number;
  geocoded_pct: number;
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  const [overview, demand, treatments, timeline, resilience, coverage] = await Promise.all([
    sb<OverviewRow>('v_search_stats_30d', { select: '*', limit: '1' }),
    sb<DemandRow>('v_demand_by_user_state', { select: '*' }),
    sb<TreatmentPopularityRow>('v_treatment_popularity_30d', { select: '*' }),
    sb<SearchTimelineRow>('v_search_timeline_30d', { select: '*' }),
    sb<SyncResilienceRow>('v_sync_resilience_90d', { select: '*', limit: '1' }),
    sb<CoverageRow>('v_coverage_by_state', { select: '*' }),
  ]);

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  json(res, 200, {
    generated_at: new Date().toISOString(),
    overview: overview[0] ?? null,
    demand_by_user_state: demand,
    treatment_popularity_30d: treatments,
    search_timeline_30d: timeline,
    sync_resilience_90d: resilience[0] ?? null,
    coverage_by_state: coverage,
  });
}
