-- =========================================================================
-- 008_metrics_phase1.sql
-- =========================================================================
-- Phase 1 — analytics groundwork.
--
-- Adds three layers of observability beyond the existing api_metrics table:
--
--   1. Enriches api_metrics with search context columns so we can answer:
--      - what is the most searched treatment?
--      - which states drive most demand?
--      - did the result set come from cache (gov.br was down)?
--
--   2. Creates sync_logs — a per-execution audit trail for the ETL.
--      Lets us prove "the gov.br portal failed X times last quarter, our
--      system continued serving cached data." Required evidence for the
--      EB2-NIW dossier (resilience narrative).
--
--   3. Creates web_events — frontend telemetry (search clicks, hospital
--      clicks, map opens). Separated from api_metrics because the volume
--      and shape are different, and we want a simple POST /v1/track that
--      doesn't pollute the request-log table.
--
-- All tables and columns are English (Phase 0 standardization).
-- Backwards-compatible: existing api_metrics rows keep their values; new
-- columns default to NULL.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. api_metrics — enrich with search context
-- -------------------------------------------------------------------------

ALTER TABLE api_metrics
    -- Treatment canonical EN name searched (NULL if not a search route).
    ADD COLUMN IF NOT EXISTS treatment_searched   TEXT,
    -- How the search was scoped: 'coords', 'cep', 'city', 'state_code', 'q', null.
    ADD COLUMN IF NOT EXISTS search_origin        TEXT,
    -- UF of the user, derived from input (CEP lookup, city, etc.). Differs
    -- from `state_code` (the filter applied to the query) — both can exist
    -- in the same row: someone in PR searching hospitals in SP.
    ADD COLUMN IF NOT EXISTS user_state_code      CHAR(2),
    -- Number of hospitals returned. 0 = explicit empty set, not an error.
    ADD COLUMN IF NOT EXISTS results_count        INTEGER,
    -- TRUE when the answer was served from cache while gov.br was unreachable
    -- on the most recent sync attempt. Drives the resilience narrative.
    ADD COLUMN IF NOT EXISTS gov_br_unreachable   BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_api_metrics_treatment
    ON api_metrics (treatment_searched, created_at DESC)
    WHERE treatment_searched IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_metrics_user_state
    ON api_metrics (user_state_code, created_at DESC)
    WHERE user_state_code IS NOT NULL;

-- -------------------------------------------------------------------------
-- 2. sync_logs — per-execution ETL audit trail
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_logs (
    id                 BIGSERIAL PRIMARY KEY,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at        TIMESTAMPTZ,
    state_code         CHAR(2)     NOT NULL,
    -- Outcome of this single state's sync run.
    -- 'success'    — PDF fetched, parsed, upserted.
    -- 'unchanged'  — gov.br data unchanged since last run, no work done.
    -- 'unsupported'— file format we don't parse (XLSX, etc.).
    -- 'failed'     — fetch/parse/upsert raised. error_* fields populated.
    status             TEXT        NOT NULL
        CHECK (status IN ('success', 'unchanged', 'unsupported', 'failed')),
    -- 'pdf_text' | 'pdf_ocr' | NULL (for unchanged/unsupported/failed)
    extraction_source  TEXT,
    -- Per-run delta counts (NULL when status != 'success').
    records_inserted   INTEGER     DEFAULT 0,
    records_updated    INTEGER     DEFAULT 0,
    records_deleted    INTEGER     DEFAULT 0,
    duration_ms        INTEGER,
    -- Failure context — populated when status='failed'.
    error_type         TEXT,
    error_message      TEXT,
    -- Source snapshot — useful to correlate failures with specific PDFs.
    pdf_url            TEXT,
    pdf_hash           TEXT,
    -- 'cron' | 'manual' | 'force' — how this run was triggered.
    triggered_by       TEXT        NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at
    ON sync_logs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_state_status
    ON sync_logs (state_code, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_logs_failures
    ON sync_logs (state_code, started_at DESC)
    WHERE status = 'failed';

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can read the log — it powers the public /stats page narrative.
-- No PII; everything here is operational data about gov.br ingestion.
CREATE POLICY "sync_logs: public read" ON sync_logs
    FOR SELECT USING (true);

-- Only the sync workflow (service_role) writes here.
-- (service_role bypasses RLS, no explicit policy needed.)

-- -------------------------------------------------------------------------
-- 3. web_events — frontend telemetry
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS web_events (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Event kinds (open-ended; check constraint keeps the schema honest
    -- without becoming an enum prison).
    event_type   TEXT NOT NULL
        CHECK (event_type IN (
            'search_executed',
            'hospital_clicked',
            'map_opened',
            'phone_clicked',
            'directions_clicked',
            'shared',
            'page_viewed'
        )),
    -- Anonymous per-tab UUID generated client-side (sessionStorage).
    -- Lets us reconstruct flows ("user searched then clicked") without
    -- identifying anyone.
    session_id   TEXT,
    -- IP hashed with the same salt used in api_metrics (LGPD-anonymized).
    ip_hash      TEXT,
    user_agent   TEXT,
    referrer     TEXT,
    -- Page path that emitted the event ('/', '/profissionais', '/stats').
    path         TEXT,
    -- Search context (when applicable).
    state_code   CHAR(2),
    treatment    TEXT,
    -- Per-event payload (e.g., hospital_id for clicks, query for searches).
    -- Schemaless to avoid frequent migrations as we add event types.
    payload      JSONB
);

CREATE INDEX IF NOT EXISTS idx_web_events_created_at
    ON web_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_events_type
    ON web_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_events_state
    ON web_events (state_code, created_at DESC)
    WHERE state_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_web_events_session
    ON web_events (session_id, created_at DESC)
    WHERE session_id IS NOT NULL;

ALTER TABLE web_events ENABLE ROW LEVEL SECURITY;

-- Aggregated stats are public, but raw events stay private (they carry
-- ip_hash + user_agent — anonymized but still operational).
CREATE POLICY "web_events: service write only" ON web_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------------------------
-- 4. Aggregate views for the public /stats page
-- -------------------------------------------------------------------------

-- Search demand over the last 30 days, scoped to actual hospital searches
-- (excludes /, /v1, metadata routes).
CREATE OR REPLACE VIEW v_search_stats_30d AS
SELECT
    COUNT(*)                                                       AS total_searches,
    COUNT(*) FILTER (WHERE results_count > 0)                      AS searches_with_results,
    COUNT(*) FILTER (WHERE results_count = 0)                      AS searches_empty,
    COUNT(DISTINCT ip_hash)                                        AS distinct_users,
    COUNT(DISTINCT user_state_code)
        FILTER (WHERE user_state_code IS NOT NULL)                 AS distinct_user_states,
    ROUND(AVG(results_count)::numeric, 1)                          AS avg_results_per_search
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
  AND route IN ('/v1/hospitals', '/v1/hospitals/nearby');

-- Geographic distribution of demand (where users searching FROM).
CREATE OR REPLACE VIEW v_demand_by_user_state AS
SELECT
    user_state_code AS state_code,
    COUNT(*)        AS searches,
    COUNT(DISTINCT ip_hash) AS distinct_users
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
  AND user_state_code IS NOT NULL
  AND route IN ('/v1/hospitals', '/v1/hospitals/nearby')
GROUP BY user_state_code
ORDER BY searches DESC;

-- Treatment popularity — which envenomations are people searching for?
CREATE OR REPLACE VIEW v_treatment_popularity_30d AS
SELECT
    treatment_searched AS treatment,
    COUNT(*)           AS searches
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
  AND treatment_searched IS NOT NULL
GROUP BY treatment_searched
ORDER BY searches DESC;

-- Daily search volume (last 30 days) for the timeline chart.
CREATE OR REPLACE VIEW v_search_timeline_30d AS
SELECT
    DATE_TRUNC('day', created_at)::date AS day,
    COUNT(*)                            AS searches,
    COUNT(DISTINCT ip_hash)             AS distinct_users
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
  AND route IN ('/v1/hospitals', '/v1/hospitals/nearby')
GROUP BY day
ORDER BY day;

-- Sync resilience — last 90 days. Powers the "gov.br failed X times" card.
CREATE OR REPLACE VIEW v_sync_resilience_90d AS
SELECT
    COUNT(*)                                              AS total_runs,
    COUNT(*) FILTER (WHERE status = 'success')            AS successful_runs,
    COUNT(*) FILTER (WHERE status = 'failed')             AS failed_runs,
    COUNT(*) FILTER (WHERE status = 'unchanged')          AS unchanged_runs,
    COUNT(*) FILTER (WHERE extraction_source = 'pdf_ocr') AS ocr_fallback_runs,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'success')
             / NULLIF(COUNT(*), 0),
        2
    )                                                     AS success_rate_pct
FROM sync_logs
WHERE started_at > NOW() - INTERVAL '90 days';

-- Per-state coverage snapshot. Updates immediately when sync writes hospitals.
CREATE OR REPLACE VIEW v_coverage_by_state AS
SELECT
    s.state_code,
    s.name,
    s.total_hospitals,
    s.status,
    s.synced_at,
    COUNT(h.id)                                                       AS hospitals_count,
    COUNT(h.id) FILTER (WHERE h.lat IS NOT NULL AND h.lng IS NOT NULL) AS geocoded_count,
    COUNT(h.id) FILTER (WHERE h.requires_verification)                AS ocr_records
FROM states s
LEFT JOIN hospitals h ON h.state_code = s.state_code
GROUP BY s.state_code, s.name, s.total_hospitals, s.status, s.synced_at
ORDER BY s.state_code;

-- Grant SELECT on the aggregate views to anon so the public /stats page can
-- read them through PostgREST without exposing the underlying tables.
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT ON v_search_stats_30d        TO anon;
        GRANT SELECT ON v_demand_by_user_state    TO anon;
        GRANT SELECT ON v_treatment_popularity_30d TO anon;
        GRANT SELECT ON v_search_timeline_30d     TO anon;
        GRANT SELECT ON v_sync_resilience_90d     TO anon;
        GRANT SELECT ON v_coverage_by_state       TO anon;
        GRANT SELECT ON sync_logs                 TO anon;
    END IF;
END
$grant$;

COMMIT;
