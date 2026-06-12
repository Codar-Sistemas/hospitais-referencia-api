-- 021: Domain analytics views for /v1/stats
--
-- The earlier stats views (008/014/020) mostly aggregate TELEMETRY
-- (api_metrics, sync_logs), which stays empty on a fresh or low-traffic
-- deploy. These views aggregate the HEALTH DATA itself, so the public
-- /estatisticas page always has something meaningful to show:
--
--   * v_specialties_by_vertical   — hospitals per specialty per vertical
--                                   (soro grades, CACON/UNACON, gene therapy…).
--   * v_state_vertical_coverage   — hospitals/cities per (state, vertical).
--                                   The frontend derives BOTH the regional
--                                   distribution and the "assistance void"
--                                   list (UFs with zero coverage) from it.
--   * v_top_cities                — municipal concentration; callers order
--                                   by hospitals_count and limit.
--   * v_data_quality              — single-row completeness snapshot
--                                   (geocoding, CNES, phones, verification).
--
-- All created WITH (security_invoker = on) so the Supabase advisor stays
-- clean; the API reads them with the service key (sbService), like the
-- other stats views after 018. Aggregates only — no PII.
--
-- Idempotent. Safe to run multiple times.

BEGIN;

CREATE OR REPLACE VIEW v_specialties_by_vertical
WITH (security_invoker = on) AS
SELECT
    vertical,
    specialty,
    COUNT(DISTINCT hospital_id)::INTEGER AS hospitals_count
FROM hospital_specialties
GROUP BY vertical, specialty;

COMMENT ON VIEW v_specialties_by_vertical IS
    'How many hospitals offer each specialty (soro type / SUS habilitation) per vertical.';

CREATE OR REPLACE VIEW v_state_vertical_coverage
WITH (security_invoker = on) AS
SELECT
    h.state_code,
    v.vertical,
    COUNT(*)::INTEGER                 AS hospitals_count,
    COUNT(DISTINCT h.city)::INTEGER   AS cities_count
FROM hospitals h
CROSS JOIN LATERAL unnest(h.verticals) AS v(vertical)
GROUP BY h.state_code, v.vertical;

COMMENT ON VIEW v_state_vertical_coverage IS
    'Hospitals and distinct cities per (state, vertical). States absent for a vertical have zero coverage — the frontend surfaces those as assistance voids.';

CREATE OR REPLACE VIEW v_top_cities
WITH (security_invoker = on) AS
SELECT
    h.city,
    h.state_code,
    COUNT(*)::INTEGER AS hospitals_count
FROM hospitals h
WHERE h.city IS NOT NULL AND btrim(h.city) <> ''
GROUP BY h.city, h.state_code;

COMMENT ON VIEW v_top_cities IS
    'Hospitals per municipality. Callers order by hospitals_count desc and limit (PostgREST params).';

CREATE OR REPLACE VIEW v_data_quality
WITH (security_invoker = on) AS
SELECT
    COUNT(*)::INTEGER                                                              AS total_hospitals,
    COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::INTEGER           AS geocoded,
    COUNT(*) FILTER (WHERE geocoding_status = 'failed')::INTEGER                   AS geocode_failed,
    COUNT(*) FILTER (WHERE geocoding_status = 'pending')::INTEGER                  AS geocode_pending,
    COUNT(*) FILTER (WHERE requires_verification)::INTEGER                         AS requires_verification,
    COUNT(*) FILTER (WHERE cnes IS NOT NULL AND btrim(cnes) <> '')::INTEGER        AS with_cnes,
    COUNT(*) FILTER (WHERE phones IS NOT NULL AND btrim(phones) <> '')::INTEGER    AS with_phones,
    COUNT(*) FILTER (WHERE extraction_source IN ('llm_gemini', 'llm_groq'))::INTEGER AS llm_extracted,
    COUNT(*) FILTER (WHERE extraction_source = 'pdf_ocr')::INTEGER                 AS ocr_extracted
FROM hospitals;

COMMENT ON VIEW v_data_quality IS
    'Single-row data completeness snapshot: geocoding backlog, manual-verification queue, CNES/phone fill rates.';

COMMIT;
