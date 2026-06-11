-- 018: Convert the 12 flagged views to security_invoker
--
-- The Supabase linter (0010_security_definer_view) flags every view that runs
-- with the creator's permissions instead of the querying user's. Our views are
-- read by:
--   * v_hospitals_all          → anon (cross-vertical /v1/search). Base tables
--                                hospitals/hospital_specialties have public-read
--                                RLS, so security_invoker works for anon.
--   * the 6 /v1/stats views    → now read with the SERVICE key (see stats.ts +
--                                sbService). service_role bypasses RLS, so it
--                                reads the aggregates regardless of invoker.
--   * the 5 metrics_* views     → dashboard-only, no programmatic reader.
--
-- So flipping every view to security_invoker satisfies the linter WITHOUT
-- exposing the raw api_metrics / sync_logs rows to anon — those stay reachable
-- only through service_role.
--
-- PREREQUISITE: deploy the API first (stats.ts must already read via sbService)
-- so /v1/stats keeps working the instant these views stop being SECURITY DEFINER.
--
-- Idempotent. Skips views that don't exist in this environment.

BEGIN;

DO $$
DECLARE
    v TEXT;
    views TEXT[] := ARRAY[
        'v_search_stats_30d',
        'v_demand_by_user_state',
        'v_treatment_popularity_30d',
        'v_search_timeline_30d',
        'v_sync_resilience_90d',
        'v_coverage_by_state',
        'v_hospitals_all',
        'metrics_cache_24h',
        'metrics_24h',
        'metrics_routes_24h',
        'metrics_hourly',
        'metrics_recent_errors'
    ];
BEGIN
    FOREACH v IN ARRAY views LOOP
        IF to_regclass('public.' || v) IS NOT NULL THEN
            EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on);', v);
        ELSE
            RAISE NOTICE 'view public.% not found — skipped', v;
        END IF;
    END LOOP;
END $$;

COMMIT;
