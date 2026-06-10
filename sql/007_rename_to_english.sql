-- =========================================================================
-- 007_rename_to_english.sql
-- =========================================================================
-- Phase 0 standardization: rename all Portuguese identifiers to English.
-- See docs/internal/REFACTORING_MAP.md for the full mapping rationale.
--
-- IMPORTANT:
--   - This migration must be deployed atomically with the updated Python
--     sync scripts and Node API, otherwise inserts will reintroduce PT
--     values for treatments / status enums.
--   - Data is translated in-place. Existing client integrations against the
--     PT contract WILL break (intentional — direct /v1 rename, no /v2).
--   - Generated columns are dropped and recreated under their new names.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Drop dependents first (RPC, views, policies, indexes, generated cols,
--    check constraints). Order matters — anything that references a column
--    being renamed has to go first.
-- -------------------------------------------------------------------------

-- 1.1 RPC (will be recreated at the end with new names/params)
DROP FUNCTION IF EXISTS hospitais_proximos(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, INTEGER
);

-- 1.2 Analytics views (will be recreated)
DROP VIEW IF EXISTS metrics_por_hora;
DROP VIEW IF EXISTS metrics_erros_recentes;
DROP VIEW IF EXISTS metrics_cache_24h;
DROP VIEW IF EXISTS metrics_rotas_24h;
DROP VIEW IF EXISTS metrics_24h;

-- 1.3 Cleanup function (will be recreated)
DROP FUNCTION IF EXISTS limpar_metricas_antigas();

-- 1.4 Indexes that reference renamed columns
DROP INDEX IF EXISTS idx_hospitais_uf;
DROP INDEX IF EXISTS idx_hospitais_municipio;
DROP INDEX IF EXISTS idx_hospitais_cnes;
DROP INDEX IF EXISTS idx_hospitais_atendimentos;
DROP INDEX IF EXISTS idx_hospitais_fts;
DROP INDEX IF EXISTS idx_hospitais_geo;
DROP INDEX IF EXISTS idx_hospitais_municipio_norm;
DROP INDEX IF EXISTS idx_hospitais_requer_verificacao;
DROP INDEX IF EXISTS idx_geocode_cache_criado;
DROP INDEX IF EXISTS idx_api_metrics_criado_em;
DROP INDEX IF EXISTS idx_api_metrics_rota;
DROP INDEX IF EXISTS idx_api_metrics_status;

-- 1.5 RLS policies (will be recreated with EN names)
DROP POLICY IF EXISTS "estados: leitura pública"   ON estados;
DROP POLICY IF EXISTS "hospitais: leitura pública" ON hospitais;
DROP POLICY IF EXISTS "cep_cache: leitura pública" ON cep_cache;
DROP POLICY IF EXISTS "geocode_cache_select_anon"  ON geocode_cache;
DROP POLICY IF EXISTS "geocode_cache_all_service"  ON geocode_cache;
DROP POLICY IF EXISTS "metrics_service_write"      ON api_metrics;

-- 1.6 Generated columns (cannot be renamed; must be dropped and recreated)
ALTER TABLE hospitais DROP COLUMN IF EXISTS municipio_norm;
ALTER TABLE hospitais DROP COLUMN IF EXISTS requer_verificacao;

-- 1.7 Check constraints (will be recreated with EN values)
ALTER TABLE hospitais DROP CONSTRAINT IF EXISTS hospitais_fonte_extracao_check;
ALTER TABLE hospitais DROP CONSTRAINT IF EXISTS hospitais_confianca_ocr_check;
ALTER TABLE estados   DROP CONSTRAINT IF EXISTS estados_status_check;

-- -------------------------------------------------------------------------
-- 2. Rename tables
-- -------------------------------------------------------------------------
ALTER TABLE estados        RENAME TO states;
ALTER TABLE hospitais      RENAME TO hospitals;
ALTER TABLE geocode_cache  RENAME TO geocoding_cache;
-- cep_cache: name kept (CEP is a non-translatable Brazilian acronym)
-- api_metrics: name kept (already EN)

-- -------------------------------------------------------------------------
-- 3. Rename columns — states (was estados)
-- -------------------------------------------------------------------------
ALTER TABLE states RENAME COLUMN uf              TO state_code;
ALTER TABLE states RENAME COLUMN nome            TO name;
ALTER TABLE states RENAME COLUMN pagina_url      TO page_url;
ALTER TABLE states RENAME COLUMN formato         TO format;
ALTER TABLE states RENAME COLUMN atualizado_em   TO updated_at;
ALTER TABLE states RENAME COLUMN sincronizado_em TO synced_at;
ALTER TABLE states RENAME COLUMN total_hospitais TO total_hospitals;
ALTER TABLE states RENAME COLUMN ultimo_erro     TO last_error;
-- kept: pdf_url, pdf_hash, status

-- -------------------------------------------------------------------------
-- 4. Rename columns — hospitals (was hospitais)
-- -------------------------------------------------------------------------
ALTER TABLE hospitals RENAME COLUMN uf                TO state_code;
ALTER TABLE hospitals RENAME COLUMN municipio         TO city;
ALTER TABLE hospitals RENAME COLUMN unidade           TO name;
ALTER TABLE hospitals RENAME COLUMN endereco          TO address;
ALTER TABLE hospitals RENAME COLUMN telefones         TO phones;
ALTER TABLE hospitals RENAME COLUMN atendimentos      TO treatments;
ALTER TABLE hospitals RENAME COLUMN atendimentos_raw  TO treatments_raw;
ALTER TABLE hospitals RENAME COLUMN criado_em         TO created_at;
ALTER TABLE hospitals RENAME COLUMN atualizado_em     TO updated_at;
ALTER TABLE hospitals RENAME COLUMN geocode_status    TO geocoding_status;
ALTER TABLE hospitals RENAME COLUMN geocode_fonte     TO geocoding_source;
ALTER TABLE hospitals RENAME COLUMN geocode_em        TO geocoded_at;
ALTER TABLE hospitals RENAME COLUMN fonte_extracao    TO extraction_source;
ALTER TABLE hospitals RENAME COLUMN confianca_ocr     TO ocr_confidence;
-- kept: id, lat, lng, cnes

-- -------------------------------------------------------------------------
-- 5. Rename columns — cep_cache
-- -------------------------------------------------------------------------
ALTER TABLE cep_cache RENAME COLUMN logradouro    TO street;
ALTER TABLE cep_cache RENAME COLUMN bairro        TO neighborhood;
ALTER TABLE cep_cache RENAME COLUMN cidade        TO city;
ALTER TABLE cep_cache RENAME COLUMN uf            TO state_code;
ALTER TABLE cep_cache RENAME COLUMN consultado_em TO queried_at;
-- kept: cep, lat, lng

-- -------------------------------------------------------------------------
-- 6. Rename columns — geocoding_cache (was geocode_cache)
-- -------------------------------------------------------------------------
ALTER TABLE geocoding_cache RENAME COLUMN fonte      TO source;
ALTER TABLE geocoding_cache RENAME COLUMN criado_em  TO created_at;
ALTER TABLE geocoding_cache RENAME COLUMN ultimo_hit TO last_hit_at;
-- kept: query_key, lat, lng, hit_count

-- -------------------------------------------------------------------------
-- 7. Rename columns — api_metrics
-- -------------------------------------------------------------------------
ALTER TABLE api_metrics RENAME COLUMN criado_em  TO created_at;
ALTER TABLE api_metrics RENAME COLUMN rota       TO route;
ALTER TABLE api_metrics RENAME COLUMN metodo     TO method;
ALTER TABLE api_metrics RENAME COLUMN duracao_ms TO duration_ms;
ALTER TABLE api_metrics RENAME COLUMN uf         TO state_code;
ALTER TABLE api_metrics RENAME COLUMN erro_tipo  TO error_type;
ALTER TABLE api_metrics RENAME COLUMN erro_msg   TO error_message;
-- kept: id, status, ip_hash, user_agent, cache_hit, rate_limited

-- -------------------------------------------------------------------------
-- 8. Translate enum-like values in data
-- -------------------------------------------------------------------------

-- 8.1 states.status: erro → error, nao_suportado → unsupported, pendente → pending
UPDATE states SET status = 'error'       WHERE status = 'erro';
UPDATE states SET status = 'unsupported' WHERE status = 'nao_suportado';
UPDATE states SET status = 'pending'     WHERE status = 'pendente';
-- kept: 'ok', 'ok_ocr'

-- 8.2 hospitals.extraction_source: pdf_texto → pdf_text
UPDATE hospitals SET extraction_source = 'pdf_text' WHERE extraction_source = 'pdf_texto';
-- kept: 'pdf_ocr'

-- 8.3 hospitals.treatments (TEXT[]): translate each canonical treatment name
--     Old (PT)        → New (EN)
--     Botrópico       → Bothropic
--     Crotálico       → Crotalic
--     Elapídico       → Elapidic
--     Laquético       → Lachetic
--     Escorpiônico    → Scorpionic
--     Loxoscélico     → Loxoscelic
--     Foneutrico      → Phoneutric
--     Lonômico        → Lonomic
--     Antiaracnídico  → Antiarachnidic
UPDATE hospitals
SET treatments = ARRAY(
    SELECT CASE elem
        WHEN 'Botrópico'      THEN 'Bothropic'
        WHEN 'Crotálico'      THEN 'Crotalic'
        WHEN 'Elapídico'      THEN 'Elapidic'
        WHEN 'Laquético'      THEN 'Lachetic'
        WHEN 'Escorpiônico'   THEN 'Scorpionic'
        WHEN 'Loxoscélico'    THEN 'Loxoscelic'
        WHEN 'Foneutrico'     THEN 'Phoneutric'
        WHEN 'Lonômico'       THEN 'Lonomic'
        WHEN 'Antiaracnídico' THEN 'Antiarachnidic'
        ELSE elem
    END
    FROM unnest(treatments) AS elem
)
WHERE treatments && ARRAY[
    'Botrópico','Crotálico','Elapídico','Laquético',
    'Escorpiônico','Loxoscélico','Foneutrico','Lonômico','Antiaracnídico'
];

-- 8.4 hospitals.geocoding_status: pendente → pending, falhou → failed
UPDATE hospitals SET geocoding_status = 'pending' WHERE geocoding_status = 'pendente';
UPDATE hospitals SET geocoding_status = 'failed'  WHERE geocoding_status = 'falhou';
-- kept: 'ok'

-- -------------------------------------------------------------------------
-- 9. Recreate check constraints with English values
-- -------------------------------------------------------------------------
ALTER TABLE hospitals
    ADD CONSTRAINT hospitals_extraction_source_check
    CHECK (extraction_source IN ('pdf_text', 'pdf_ocr'));

ALTER TABLE hospitals
    ADD CONSTRAINT hospitals_ocr_confidence_check
    CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 100));

ALTER TABLE states
    ADD CONSTRAINT states_status_check
    CHECK (status IS NULL OR status IN ('ok', 'ok_ocr', 'error', 'unsupported', 'pending'));

-- Default for extraction_source must also be updated
ALTER TABLE hospitals
    ALTER COLUMN extraction_source SET DEFAULT 'pdf_text';

-- -------------------------------------------------------------------------
-- 10. Recreate generated columns with new names
-- -------------------------------------------------------------------------

-- city_normalized: lowercase + accent-stripped city, used for case/accent-
-- insensitive city lookups.
ALTER TABLE hospitals
    ADD COLUMN city_normalized TEXT
    GENERATED ALWAYS AS (
        lower(translate(
            city,
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        ))
    ) STORED;

-- requires_verification: true when row was OCR-extracted and needs a human
-- check before being acted upon (frontend shows a prominent warning).
ALTER TABLE hospitals
    ADD COLUMN requires_verification BOOLEAN
    GENERATED ALWAYS AS (extraction_source = 'pdf_ocr') STORED;

-- -------------------------------------------------------------------------
-- 11. Recreate indexes with English names
-- -------------------------------------------------------------------------

CREATE INDEX idx_hospitals_state_code   ON hospitals (state_code);
CREATE INDEX idx_hospitals_city         ON hospitals (lower(city));
CREATE INDEX idx_hospitals_cnes         ON hospitals (cnes);
CREATE INDEX idx_hospitals_treatments   ON hospitals USING GIN (treatments);

-- Full-text search over name + address (Portuguese dictionary stays —
-- this indexes Portuguese-language content, not identifier names).
CREATE INDEX idx_hospitals_fts ON hospitals
    USING GIN (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(address,'')));

-- Geographic index for nearby_hospitals queries
CREATE INDEX idx_hospitals_geo
    ON hospitals USING gist (ll_to_earth(lat, lng))
    WHERE lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX idx_hospitals_city_normalized ON hospitals (city_normalized);

CREATE INDEX idx_hospitals_requires_verification
    ON hospitals (state_code)
    WHERE requires_verification = true;

CREATE INDEX idx_geocoding_cache_created_at ON geocoding_cache (created_at);

CREATE INDEX idx_api_metrics_created_at ON api_metrics (created_at DESC);
CREATE INDEX idx_api_metrics_route      ON api_metrics (route, created_at DESC);
CREATE INDEX idx_api_metrics_status     ON api_metrics (status, created_at DESC)
    WHERE status >= 400;

-- -------------------------------------------------------------------------
-- 12. Recreate RLS policies with English names
-- -------------------------------------------------------------------------
CREATE POLICY "states: public read"    ON states    FOR SELECT USING (true);
CREATE POLICY "hospitals: public read" ON hospitals FOR SELECT USING (true);
CREATE POLICY "cep_cache: public read" ON cep_cache FOR SELECT USING (true);

CREATE POLICY "geocoding_cache_select_anon"
    ON geocoding_cache FOR SELECT TO anon USING (true);

CREATE POLICY "geocoding_cache_all_service"
    ON geocoding_cache FOR ALL TO service_role USING (true);

CREATE POLICY "metrics_service_write" ON api_metrics
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------------------------
-- 13. Recreate RPC with English names and parameters
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nearby_hospitals(
    p_lat       DOUBLE PRECISION,
    p_lng       DOUBLE PRECISION,
    p_radius_m  INTEGER DEFAULT 50000,
    p_state_code TEXT   DEFAULT NULL,
    p_treatment TEXT    DEFAULT NULL,
    p_limit     INTEGER DEFAULT 50
)
RETURNS TABLE (
    id                     INTEGER,
    state_code             CHAR(2),
    city                   TEXT,
    name                   TEXT,
    address                TEXT,
    phones                 TEXT,
    cnes                   TEXT,
    treatments             TEXT[],
    lat                    DOUBLE PRECISION,
    lng                    DOUBLE PRECISION,
    distance_m             DOUBLE PRECISION,
    extraction_source      TEXT,
    ocr_confidence         SMALLINT,
    requires_verification  BOOLEAN
)
LANGUAGE sql STABLE AS $$
    SELECT
        h.id, h.state_code, h.city, h.name, h.address, h.phones,
        h.cnes, h.treatments, h.lat, h.lng,
        earth_distance(
            ll_to_earth(h.lat, h.lng),
            ll_to_earth(p_lat, p_lng)
        ) AS distance_m,
        h.extraction_source,
        h.ocr_confidence,
        h.requires_verification
    FROM hospitals h
    WHERE h.lat IS NOT NULL
      AND h.lng IS NOT NULL
      AND earth_box(ll_to_earth(p_lat, p_lng), p_radius_m) @> ll_to_earth(h.lat, h.lng)
      AND earth_distance(ll_to_earth(h.lat, h.lng), ll_to_earth(p_lat, p_lng)) <= p_radius_m
      AND (p_state_code IS NULL OR h.state_code = upper(p_state_code))
      AND (p_treatment  IS NULL OR p_treatment  = ANY(h.treatments))
    ORDER BY distance_m ASC
    LIMIT p_limit;
$$;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION nearby_hospitals TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION nearby_hospitals TO authenticated';
    END IF;
END
$grant$;

-- -------------------------------------------------------------------------
-- 14. Recreate analytics views with English column names
-- -------------------------------------------------------------------------

-- Last 24h overview
CREATE OR REPLACE VIEW metrics_24h AS
SELECT
    COUNT(*)                                                AS total_requests,
    COUNT(*) FILTER (WHERE status < 400)                    AS successes,
    COUNT(*) FILTER (WHERE status >= 400 AND status < 500)  AS client_errors,
    COUNT(*) FILTER (WHERE status >= 500)                   AS server_errors,
    COUNT(*) FILTER (WHERE rate_limited)                    AS rate_limited,
    COUNT(DISTINCT ip_hash)                                 AS distinct_ips,
    ROUND(AVG(duration_ms)::numeric, 1)                     AS avg_duration_ms,
    ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric,
        1
    )                                                       AS p95_duration_ms
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Top routes by traffic (24h)
CREATE OR REPLACE VIEW metrics_routes_24h AS
SELECT
    route,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE status >= 400)                   AS errors,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status >= 400) / NULLIF(COUNT(*), 0),
        2
    )                                                       AS error_rate_pct,
    ROUND(AVG(duration_ms)::numeric, 1)                     AS avg_duration_ms
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY route
ORDER BY total DESC;

-- Cache hit rate per route (24h)
CREATE OR REPLACE VIEW metrics_cache_24h AS
SELECT
    route,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE cache_hit = true)                AS hits,
    COUNT(*) FILTER (WHERE cache_hit = false)               AS misses,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE cache_hit = true)
             / NULLIF(COUNT(*) FILTER (WHERE cache_hit IS NOT NULL), 0),
        2
    )                                                       AS hit_rate_pct
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND cache_hit IS NOT NULL
GROUP BY route
ORDER BY total DESC;

-- Last 100 failures
CREATE OR REPLACE VIEW metrics_recent_errors AS
SELECT
    created_at,
    route,
    status,
    error_type,
    error_message,
    duration_ms
FROM api_metrics
WHERE status >= 400
ORDER BY created_at DESC
LIMIT 100;

-- Requests per hour (last 48h)
CREATE OR REPLACE VIEW metrics_hourly AS
SELECT
    DATE_TRUNC('hour', created_at)                          AS hour,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE status >= 400)                   AS errors,
    COUNT(DISTINCT ip_hash)                                 AS distinct_ips
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '48 hours'
GROUP BY hour
ORDER BY hour DESC;

-- -------------------------------------------------------------------------
-- 15. Recreate cleanup function with English name
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER AS $$
DECLARE
    rows_removed INTEGER;
BEGIN
    DELETE FROM api_metrics
    WHERE created_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS rows_removed = ROW_COUNT;
    RETURN rows_removed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
