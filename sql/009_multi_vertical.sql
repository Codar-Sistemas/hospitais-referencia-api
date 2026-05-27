-- =========================================================================
-- 009_multi_vertical.sql
-- =========================================================================
-- Phase 2 — MapaSUS platform foundation.
--
-- Until now the API has served a single vertical (peçonhentos / venomous
-- animals). The MapaSUS roadmap calls for a *platform* hosting multiple
-- SUS-related directories (oncology, rare diseases, transplants, etc).
--
-- Design principles
--   1. A hospital is a single entity. The same CNES can be habilitado in
--      multiple federal programmes (e.g. oncology AND venomous-animal
--      treatment) — we want to surface that overlap, not duplicate rows.
--   2. The old `hospitals.treatments TEXT[]` column is preserved for
--      backward compatibility. Nothing existing breaks.
--   3. A new normalised table `hospital_specialties` carries the
--      (hospital, vertical, specialty) tuples used by the new API.
--   4. Discriminator column `hospitals.verticals TEXT[]` lets us index
--      and filter quickly without a join.
--   5. Backfill writes every existing peçonhentos row into the new model,
--      so the multi-vertical API can serve the old vertical from day one.
--
-- Reversible. See bottom-of-file rollback recipe.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Discriminator on hospitals
-- -------------------------------------------------------------------------
-- Empty array = legacy / not yet classified. Default keeps existing rows
-- valid but does NOT auto-populate them — see step 4 for the explicit
-- backfill (we want auditability, not magic).

ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS verticals TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_hospitals_verticals
    ON hospitals USING GIN (verticals);

COMMENT ON COLUMN hospitals.verticals IS
    'Which MapaSUS verticals a hospital belongs to. Populated from hospital_specialties via the backfill. Indexed for fast filtering.';

-- -------------------------------------------------------------------------
-- 2. Normalised specialties per vertical
-- -------------------------------------------------------------------------
-- One row = (hospital, vertical, specialty). A hospital habilitado for
-- both bothropic and crotalic soros has two rows in the 'peconhentos'
-- vertical. A hospital habilitado for oncology + peconhentos has rows
-- in both verticals.

CREATE TABLE IF NOT EXISTS hospital_specialties (
    hospital_id     INTEGER      NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    vertical        TEXT         NOT NULL,                -- 'peconhentos' | 'raras' | 'oncologia' | ...
    specialty       TEXT         NOT NULL,                -- canonical, lower_snake_case
    habilitado_em   DATE,                                 -- date the establishment was habilitado (when known)
    portaria        TEXT,                                 -- referencing ordinance, when known
    source_url      TEXT         NOT NULL,                -- where we extracted it from
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (hospital_id, vertical, specialty)
);

CREATE INDEX IF NOT EXISTS idx_hospital_specialties_vertical
    ON hospital_specialties (vertical);
CREATE INDEX IF NOT EXISTS idx_hospital_specialties_vertical_specialty
    ON hospital_specialties (vertical, specialty);

COMMENT ON TABLE hospital_specialties IS
    'Normalised SUS habilitations per (hospital, vertical, specialty). Source of truth for MapaSUS multi-vertical API.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_hospital_specialties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hospital_specialties_updated_at ON hospital_specialties;
CREATE TRIGGER trg_hospital_specialties_updated_at
    BEFORE UPDATE ON hospital_specialties
    FOR EACH ROW
    EXECUTE FUNCTION set_hospital_specialties_updated_at();

-- -------------------------------------------------------------------------
-- 3. Cross-vertical view
-- -------------------------------------------------------------------------
-- Convenience view for the /v1/search endpoint. Aggregates which
-- verticals a hospital is active in so the frontend can render badges
-- ("peçonhentos + oncologia") without an extra round-trip.

CREATE OR REPLACE VIEW v_hospitals_all AS
SELECT
    h.*,
    COALESCE(
        (SELECT array_agg(DISTINCT vertical ORDER BY vertical)
         FROM hospital_specialties s
         WHERE s.hospital_id = h.id),
        ARRAY[]::TEXT[]
    ) AS active_verticals,
    COALESCE(
        (SELECT array_agg(DISTINCT specialty ORDER BY specialty)
         FROM hospital_specialties s
         WHERE s.hospital_id = h.id),
        ARRAY[]::TEXT[]
    ) AS active_specialties
FROM hospitals h;

COMMENT ON VIEW v_hospitals_all IS
    'Hospitals enriched with the verticals and specialties they are habilitado for. Used by /v1/search.';

-- -------------------------------------------------------------------------
-- 4. Backfill — every existing hospital is 'peconhentos' with its
--    current treatments as specialties
-- -------------------------------------------------------------------------

-- 4a. Tag every existing hospital as belonging to the peconhentos vertical
UPDATE hospitals
SET verticals = ARRAY['peconhentos']::TEXT[]
WHERE NOT 'peconhentos' = ANY(verticals);

-- 4b. Explode the treatments array into hospital_specialties rows
INSERT INTO hospital_specialties (hospital_id, vertical, specialty, source_url, metadata)
SELECT
    h.id,
    'peconhentos'                                     AS vertical,
    treatment                                         AS specialty,
    COALESCE(h.extraction_source, 'legacy_backfill')  AS source_url,
    jsonb_build_object('backfilled_from', 'hospitals.treatments')
FROM hospitals h,
     unnest(h.treatments) AS treatment
WHERE h.treatments IS NOT NULL
  AND array_length(h.treatments, 1) IS NOT NULL
ON CONFLICT (hospital_id, vertical, specialty) DO NOTHING;

-- -------------------------------------------------------------------------
-- 5. Sanity checks (will raise if backfill is inconsistent)
-- -------------------------------------------------------------------------
DO $$
DECLARE
    total_hospitals       BIGINT;
    tagged_peconhentos    BIGINT;
    specialty_rows        BIGINT;
BEGIN
    SELECT count(*) INTO total_hospitals FROM hospitals;
    SELECT count(*) INTO tagged_peconhentos
        FROM hospitals WHERE 'peconhentos' = ANY(verticals);
    SELECT count(*) INTO specialty_rows
        FROM hospital_specialties WHERE vertical = 'peconhentos';

    RAISE NOTICE '009_multi_vertical: hospitals=% tagged_peconhentos=% specialty_rows=%',
        total_hospitals, tagged_peconhentos, specialty_rows;

    IF total_hospitals > 0 AND tagged_peconhentos = 0 THEN
        RAISE EXCEPTION 'Backfill failed: 0 hospitals tagged as peconhentos';
    END IF;
END $$;

COMMIT;

-- =========================================================================
-- Rollback recipe (run manually if you need to undo this migration):
--
--   BEGIN;
--   DROP VIEW IF EXISTS v_hospitals_all;
--   DROP TRIGGER IF EXISTS trg_hospital_specialties_updated_at ON hospital_specialties;
--   DROP FUNCTION IF EXISTS set_hospital_specialties_updated_at();
--   DROP TABLE IF EXISTS hospital_specialties;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS verticals;
--   COMMIT;
--
-- Note: rolling back does not touch hospitals.treatments, which remains
-- the source of truth for the legacy peconhentos vertical.
-- =========================================================================
