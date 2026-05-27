-- =========================================================================
-- 010_rpc_vertical.sql
-- =========================================================================
-- Phase 2 — extends nearby_hospitals() with a vertical filter so the
-- multi-vertical API can serve geo searches scoped to a single MapaSUS
-- vertical (peconhentos / raras / oncologia / ...).
--
-- Backwards compatible: p_vertical defaults to 'peconhentos', so existing
-- API callers continue to receive the same payload they always have.
--
-- Reversible — restore the prior signature from sql/007_rename_to_english.sql.
-- =========================================================================

BEGIN;

DROP FUNCTION IF EXISTS nearby_hospitals(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, INTEGER
);

CREATE OR REPLACE FUNCTION nearby_hospitals(
    p_lat        DOUBLE PRECISION,
    p_lng        DOUBLE PRECISION,
    p_radius_m   INTEGER DEFAULT 50000,
    p_state_code TEXT    DEFAULT NULL,
    p_treatment  TEXT    DEFAULT NULL,
    p_limit      INTEGER DEFAULT 50,
    p_vertical   TEXT    DEFAULT 'peconhentos'
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
    requires_verification  BOOLEAN,
    verticals              TEXT[]
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
        h.requires_verification,
        h.verticals
    FROM hospitals h
    WHERE h.lat IS NOT NULL
      AND h.lng IS NOT NULL
      AND earth_box(ll_to_earth(p_lat, p_lng), p_radius_m) @> ll_to_earth(h.lat, h.lng)
      AND earth_distance(ll_to_earth(h.lat, h.lng), ll_to_earth(p_lat, p_lng)) <= p_radius_m
      AND (p_state_code IS NULL OR h.state_code = upper(p_state_code))
      AND (p_treatment  IS NULL OR p_treatment  = ANY(h.treatments))
      AND (p_vertical   IS NULL OR p_vertical   = ANY(h.verticals))
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
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION nearby_hospitals TO service_role';
    END IF;
END
$grant$;

COMMIT;
