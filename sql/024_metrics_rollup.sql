-- 024: Daily metrics rollup — keep long-term trends without keeping raw PII
--
-- cleanup_old_metrics() purges api_metrics/web_events after 30 days (privacy).
-- To still answer "how did search demand per area evolve over the year", we
-- roll the raw rows up into a daily summary BEFORE they're purged. The summary
-- carries NO ip_hash — only pre-computed counts (distinct_users is the COUNT of
-- distinct hashes for that day, a number, not an identifier) — so it can be
-- retained indefinitely.
--
-- The weekly job runs rollup_metrics_daily() THEN cleanup_old_metrics(). The
-- rollup re-aggregates the last 40 days each run (idempotent upsert), so every
-- day is captured well before the 30-day purge removes it.

BEGIN;

CREATE TABLE IF NOT EXISTS metrics_daily (
    day                    DATE    NOT NULL,
    vertical               TEXT    NOT NULL,
    searches               INTEGER NOT NULL DEFAULT 0,
    distinct_users         INTEGER NOT NULL DEFAULT 0,
    searches_with_results  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, vertical)
);

COMMENT ON TABLE metrics_daily IS
    'Retained daily search aggregates per vertical (no PII). Backfilled from api_metrics by rollup_metrics_daily() before the 30-day purge.';

-- Aggregate, no PII → public read; writes only via the SECURITY DEFINER rollup.
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "metrics_daily: public read" ON metrics_daily;
CREATE POLICY "metrics_daily: public read" ON metrics_daily FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION rollup_metrics_daily()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rows_upserted INTEGER;
BEGIN
    INSERT INTO metrics_daily AS m (day, vertical, searches, distinct_users, searches_with_results)
    SELECT
        created_at::date                              AS day,
        COALESCE(vertical, 'venomous_animals')        AS vertical,
        COUNT(*)::INTEGER                             AS searches,
        COUNT(DISTINCT ip_hash)::INTEGER              AS distinct_users,
        COUNT(*) FILTER (WHERE results_count > 0)::INTEGER AS searches_with_results
    FROM api_metrics
    WHERE results_count IS NOT NULL                   -- search routes only
      AND created_at >= CURRENT_DATE - INTERVAL '40 days'
    GROUP BY 1, 2
    ON CONFLICT (day, vertical) DO UPDATE SET
        searches              = EXCLUDED.searches,
        distinct_users        = EXCLUDED.distinct_users,
        searches_with_results = EXCLUDED.searches_with_results;

    GET DIAGNOSTICS rows_upserted = ROW_COUNT;
    RETURN rows_upserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION rollup_metrics_daily() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rollup_metrics_daily() FROM anon;
REVOKE EXECUTE ON FUNCTION rollup_metrics_daily() FROM authenticated;
GRANT  EXECUTE ON FUNCTION rollup_metrics_daily() TO service_role;

COMMIT;
