-- =========================================================================
-- 014_stats_by_extraction_method.sql
-- =========================================================================
-- Break the stats views down by extraction method so the public /stats
-- page distinguishes between the Tesseract fallback and the LLM
-- fallback. Before this migration both were lumped under "ocr_*".
--
-- Affects two views:
--   - v_sync_resilience_90d (`sync_logs`):
--       * keeps `ocr_fallback_runs` (Tesseract only)
--       * adds  `llm_fallback_runs` (sum of llm_gemini + llm_groq)
--       * adds  `llm_gemini_runs` and `llm_groq_runs` for breakdown
--   - v_coverage_by_state (`hospitals` × `states`):
--       * keeps `ocr_records`   (only `pdf_ocr`)
--       * adds  `llm_records`   (sum of llm_* rows)
--
-- Reversible — see rollback recipe at the bottom.
-- =========================================================================

BEGIN;

-- CREATE OR REPLACE refuses to insert new columns mid-list, so we drop
-- and re-create both views from scratch.
DROP VIEW IF EXISTS v_sync_resilience_90d;
DROP VIEW IF EXISTS v_coverage_by_state;

CREATE VIEW v_sync_resilience_90d AS
SELECT
    COUNT(*)                                                    AS total_runs,
    COUNT(*) FILTER (WHERE status = 'success')                  AS successful_runs,
    COUNT(*) FILTER (WHERE status = 'failed')                   AS failed_runs,
    COUNT(*) FILTER (WHERE status = 'unchanged')                AS unchanged_runs,
    COUNT(*) FILTER (WHERE extraction_source = 'pdf_ocr')       AS ocr_fallback_runs,
    COUNT(*) FILTER (WHERE extraction_source = 'llm_gemini')    AS llm_gemini_runs,
    COUNT(*) FILTER (WHERE extraction_source = 'llm_groq')      AS llm_groq_runs,
    COUNT(*) FILTER (
        WHERE extraction_source IN ('llm_gemini', 'llm_groq')
    )                                                           AS llm_fallback_runs,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'success')
             / NULLIF(COUNT(*), 0),
        2
    )                                                           AS success_rate_pct
FROM sync_logs
WHERE started_at > NOW() - INTERVAL '90 days';

CREATE VIEW v_coverage_by_state AS
SELECT
    s.state_code,
    s.name,
    s.total_hospitals,
    s.status,
    s.synced_at,
    COUNT(h.id)                                                            AS hospitals_count,
    COUNT(h.id) FILTER (WHERE h.lat IS NOT NULL AND h.lng IS NOT NULL)     AS geocoded_count,
    COUNT(h.id) FILTER (WHERE h.extraction_source = 'pdf_ocr')             AS ocr_records,
    COUNT(h.id) FILTER (
        WHERE h.extraction_source IN ('llm_gemini', 'llm_groq')
    )                                                                      AS llm_records
FROM states s
LEFT JOIN hospitals h ON h.state_code = s.state_code
GROUP BY s.state_code, s.name, s.total_hospitals, s.status, s.synced_at
ORDER BY s.state_code;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT ON v_sync_resilience_90d TO anon;
        GRANT SELECT ON v_coverage_by_state   TO anon;
    END IF;
END
$grant$;

COMMIT;

-- =========================================================================
-- Rollback recipe:
--
--   BEGIN;
--   CREATE OR REPLACE VIEW v_sync_resilience_90d AS
--   SELECT
--       COUNT(*) AS total_runs,
--       COUNT(*) FILTER (WHERE status='success')        AS successful_runs,
--       COUNT(*) FILTER (WHERE status='failed')         AS failed_runs,
--       COUNT(*) FILTER (WHERE status='unchanged')      AS unchanged_runs,
--       COUNT(*) FILTER (WHERE extraction_source='pdf_ocr') AS ocr_fallback_runs,
--       ROUND(100.0 * COUNT(*) FILTER (WHERE status='success') / NULLIF(COUNT(*),0), 2)
--                                                       AS success_rate_pct
--   FROM sync_logs WHERE started_at > NOW() - INTERVAL '90 days';
--
--   CREATE OR REPLACE VIEW v_coverage_by_state AS
--   SELECT s.state_code, s.name, s.total_hospitals, s.status, s.synced_at,
--          COUNT(h.id) AS hospitals_count,
--          COUNT(h.id) FILTER (WHERE h.lat IS NOT NULL AND h.lng IS NOT NULL) AS geocoded_count,
--          COUNT(h.id) FILTER (WHERE h.requires_verification) AS ocr_records
--   FROM states s LEFT JOIN hospitals h ON h.state_code = s.state_code
--   GROUP BY s.state_code, s.name, s.total_hospitals, s.status, s.synced_at
--   ORDER BY s.state_code;
--   COMMIT;
-- =========================================================================
