// Queries the read-only stats views (sql/008, 014, 020 and 021).
// No PII; safe for CDN caching.

import { json } from '../core/http.js';
import { sbService } from '../core/supabase.js';
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
  successful_runs: number;
  failed_runs: number;
  unchanged_runs: number;
  ocr_fallback_runs: number;
  llm_fallback_runs: number;
  llm_gemini_runs: number;
  llm_groq_runs: number;
  success_rate_pct: number | null;
}
interface VerticalHospitalsRow {
  vertical: string;
  hospitals_count: number;
  geocoded_count: number;
}
interface VerticalSyncRow {
  vertical: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
}
interface CoverageRow {
  state_code: string;
  name: string;
  total_hospitals: number;
  status: string | null;
  synced_at: string | null;
  hospitals_count: number;
  geocoded_count: number;
  ocr_records: number;
  llm_records: number;
}
interface SpecialtyRow {
  vertical: string;
  specialty: string;
  hospitals_count: number;
}
interface StateVerticalCoverageRow {
  state_code: string;
  vertical: string;
  hospitals_count: number;
  cities_count: number;
}
interface TopCityRow {
  city: string;
  state_code: string;
  hospitals_count: number;
}
interface DataQualityRow {
  total_hospitals: number;
  geocoded: number;
  geocode_failed: number;
  geocode_pending: number;
  requires_verification: number;
  with_cnes: number;
  with_phones: number;
  llm_extracted: number;
  ocr_extracted: number;
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  const [
    overview,
    demand,
    treatments,
    timeline,
    resilience,
    coverage,
    byVertical,
    lastSyncs,
    specialties,
    stateVerticalCoverage,
    topCities,
    dataQuality,
  ] = await Promise.all([
    sbService<OverviewRow>('v_search_stats_30d', { select: '*', limit: '1' }),
    sbService<DemandRow>('v_demand_by_user_state', { select: '*' }),
    sbService<TreatmentPopularityRow>('v_treatment_popularity_30d', { select: '*' }),
    sbService<SearchTimelineRow>('v_search_timeline_30d', { select: '*' }),
    sbService<SyncResilienceRow>('v_sync_resilience_90d', { select: '*', limit: '1' }),
    sbService<CoverageRow>('v_coverage_by_state', { select: '*' }),
    // Per-vertical views land with migration 020 — degrade to an empty
    // section (not a 500) on databases that haven't applied it yet.
    sbService<VerticalHospitalsRow>('v_hospitals_by_vertical', { select: '*' }).catch(() => []),
    sbService<VerticalSyncRow>('v_last_sync_by_vertical', { select: '*' }).catch(() => []),
    // Domain analytics views land with migration 021 — same degradation rule.
    sbService<SpecialtyRow>('v_specialties_by_vertical', {
      select: '*',
      order: 'vertical.asc,hospitals_count.desc',
    }).catch(() => []),
    sbService<StateVerticalCoverageRow>('v_state_vertical_coverage', { select: '*' }).catch(
      () => [],
    ),
    sbService<TopCityRow>('v_top_cities', {
      select: '*',
      order: 'hospitals_count.desc,city.asc',
      limit: '15',
    }).catch(() => []),
    sbService<DataQualityRow>('v_data_quality', { select: '*', limit: '1' }).catch(() => []),
  ]);

  const lastSyncByVertical = new Map(lastSyncs.map((s) => [s.vertical, s]));
  const by_vertical = byVertical
    .map((row) => {
      const sync = lastSyncByVertical.get(row.vertical);
      return {
        vertical: row.vertical,
        hospitals_count: row.hospitals_count,
        geocoded_count: row.geocoded_count,
        last_sync_status: sync?.status ?? null,
        last_sync_at: sync?.started_at ?? null,
      };
    })
    .sort((a, b) => b.hospitals_count - a.hospitals_count);

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  json(res, 200, {
    generated_at: new Date().toISOString(),
    overview: overview[0] ?? null,
    by_vertical,
    demand_by_user_state: demand,
    treatment_popularity_30d: treatments,
    search_timeline_30d: timeline,
    sync_resilience_90d: resilience[0] ?? null,
    coverage_by_state: coverage,
    specialties_by_vertical: specialties,
    state_vertical_coverage: stateVerticalCoverage,
    top_cities: topCities,
    data_quality: dataQuality[0] ?? null,
  });
}
