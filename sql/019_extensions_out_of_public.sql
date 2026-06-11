-- 019: Move cube/earthdistance out of `public` (clears the last 2 advisor warnings)
--
-- Why this is fiddly: nearby_hospitals is a LANGUAGE sql function, so its body
-- is parsed at definition time and hard-depends (by OID) on earthdistance's
-- functions (earth_distance/ll_to_earth/earth_box) and cube's `@>` operator.
--   * cube IS relocatable           → ALTER EXTENSION ... SET SCHEMA works.
--   * earthdistance is NOT           → must DROP + CREATE in the new schema.
--   * DROP earthdistance is blocked  → drop nearby_hospitals first, recreate after.
-- A SQL function re-parses its body on a fresh backend using its own search_path,
-- so the recreated function MUST carry `search_path = public, extensions` or it
-- stops resolving the operators once the extensions leave `public`.
--
-- Everything runs in ONE transaction: any error rolls the whole thing back and
-- production is left exactly as it was. After running, smoke-test /v1/.../nearby.
--
-- The nearby_hospitals body below is byte-for-byte the current prod definition
-- (sql/010_rpc_vertical.sql) — only the `SET search_path` clause is added.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- 1) Drop the dependent function so earthdistance can be dropped.
DROP FUNCTION IF EXISTS nearby_hospitals(
    double precision, double precision, integer, text, text, integer, text
);

-- 2) Relocate the extensions.
ALTER EXTENSION cube SET SCHEMA extensions;   -- relocatable
DROP EXTENSION earthdistance;                  -- non-relocatable → recreate
CREATE EXTENSION earthdistance SCHEMA extensions;

-- 3) Recreate nearby_hospitals, now resolving operators from `extensions` too.
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
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
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

-- 4) Re-grant execute (DROP/CREATE wiped the old grants).
GRANT EXECUTE ON FUNCTION nearby_hospitals(
    double precision, double precision, integer, text, text, integer, text
) TO anon, authenticated, service_role;

COMMIT;
