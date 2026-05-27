-- =========================================================================
-- 011_rename_animais_peconhentos.sql
-- =========================================================================
-- Phase 2 — corrects the vertical key for the venomous-animals programme.
--
-- Migration 009 introduced `verticals = ['peconhentos']` as the placeholder
-- name. Per the MapaSUS naming convention finalised in Phase 2.5, every
-- vertical is now named after the agravo / programa it covers, using the
-- exact terminology gov.br uses for that programme:
--
--   * 'peconhentos'  → 'animais_peconhentos'   (Animais Peçonhentos — MS)
--
-- All other places in the stack (repositories, services, router, sync
-- scripts) are updated in lockstep in the same commit, so callers never
-- see a mid-state. Old `/v1/hospitals` (no vertical prefix) keeps working
-- because the repository still defaults to the new key.
--
-- Reversible recipe at the bottom.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. hospitals.verticals (TEXT[]) — replace element in each array
-- -------------------------------------------------------------------------
UPDATE hospitals
SET verticals = array_replace(verticals, 'peconhentos', 'animais_peconhentos')
WHERE 'peconhentos' = ANY(verticals);

-- -------------------------------------------------------------------------
-- 2. hospital_specialties.vertical (TEXT)
-- -------------------------------------------------------------------------
UPDATE hospital_specialties
SET vertical = 'animais_peconhentos'
WHERE vertical = 'peconhentos';

-- -------------------------------------------------------------------------
-- 3. Sanity check — no row should reference the old key after this point
-- -------------------------------------------------------------------------
DO $$
DECLARE
    leftover_hospitals  BIGINT;
    leftover_specs      BIGINT;
    new_hospitals       BIGINT;
    new_specs           BIGINT;
BEGIN
    SELECT count(*) INTO leftover_hospitals
        FROM hospitals WHERE 'peconhentos' = ANY(verticals);
    SELECT count(*) INTO leftover_specs
        FROM hospital_specialties WHERE vertical = 'peconhentos';
    SELECT count(*) INTO new_hospitals
        FROM hospitals WHERE 'animais_peconhentos' = ANY(verticals);
    SELECT count(*) INTO new_specs
        FROM hospital_specialties WHERE vertical = 'animais_peconhentos';

    RAISE NOTICE
        '011_rename_animais_peconhentos: '
        'leftover_hospitals=% leftover_specialties=% '
        'new_hospitals=% new_specialties=%',
        leftover_hospitals, leftover_specs, new_hospitals, new_specs;

    IF leftover_hospitals > 0 THEN
        RAISE EXCEPTION 'Rename incomplete: % hospital row(s) still reference ''peconhentos''',
            leftover_hospitals;
    END IF;
    IF leftover_specs > 0 THEN
        RAISE EXCEPTION 'Rename incomplete: % specialty row(s) still reference ''peconhentos''',
            leftover_specs;
    END IF;
END $$;

COMMIT;

-- =========================================================================
-- Rollback recipe (run manually if you need to undo this migration):
--
--   BEGIN;
--   UPDATE hospitals
--   SET verticals = array_replace(verticals, 'animais_peconhentos', 'peconhentos')
--   WHERE 'animais_peconhentos' = ANY(verticals);
--   UPDATE hospital_specialties
--   SET vertical = 'peconhentos'
--   WHERE vertical = 'animais_peconhentos';
--   COMMIT;
--
-- =========================================================================
