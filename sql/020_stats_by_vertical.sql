-- 020: Per-vertical stats views for /v1/stats ("Por área de saúde" section)
--
-- Two read-only views:
--   * v_hospitals_by_vertical  — how many hospitals serve each vertical
--                                (a hospital shared by N verticals counts in each).
--   * v_last_sync_by_vertical  — the most recent sync_logs row per vertical
--                                (sync_logs.vertical exists since 015).
--
-- Both are created WITH (security_invoker = on) so the Supabase advisor stays
-- clean. The API reads them with the service key (sbService), matching the
-- other stats views after 018.
--
-- Idempotent. Safe to run multiple times.

BEGIN;

CREATE OR REPLACE VIEW v_hospitals_by_vertical
WITH (security_invoker = on) AS
SELECT
    v.vertical,
    COUNT(*)::INTEGER                                   AS hospitals_count,
    COUNT(*) FILTER (WHERE h.lat IS NOT NULL)::INTEGER  AS geocoded_count
FROM hospitals h
CROSS JOIN LATERAL unnest(h.verticals) AS v(vertical)
GROUP BY v.vertical;

COMMENT ON VIEW v_hospitals_by_vertical IS
    'Hospital counts per vertical (shared hospitals count once per vertical they serve).';

CREATE OR REPLACE VIEW v_last_sync_by_vertical
WITH (security_invoker = on) AS
SELECT DISTINCT ON (vertical)
    vertical,
    status,
    started_at,
    finished_at,
    triggered_by
FROM sync_logs
ORDER BY vertical, started_at DESC;

COMMENT ON VIEW v_last_sync_by_vertical IS
    'Most recent sync run per vertical — powers the per-area health card on /estatisticas.';

COMMIT;
