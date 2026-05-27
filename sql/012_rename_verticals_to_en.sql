-- =========================================================================
-- 012_rename_verticals_to_en.sql
-- =========================================================================
-- Phase 2.5.0.x — MapaSUS naming policy: backend/DB/URL in English,
-- display strings stay in Portuguese on the frontend.
--
-- Renames vertical DB keys so identifiers used by code (Python modules,
-- TypeScript types, URL paths) follow the project's English convention.
-- Display names ("Animais Peçonhentos", "Doenças Raras") are NOT stored
-- here — they live in the frontend translation dictionary until the
-- `vertical_sources` table (Phase 2.5.2) takes over as the source of
-- truth.
--
--   animais_peconhentos → venomous_animals
--   doencas_raras       → rare_diseases
--   oncologia           → oncology
--
-- Reversible recipe at the bottom.
-- =========================================================================

BEGIN;

UPDATE hospitals
SET verticals = array_replace(verticals, 'animais_peconhentos', 'venomous_animals')
WHERE 'animais_peconhentos' = ANY(verticals);

UPDATE hospitals
SET verticals = array_replace(verticals, 'doencas_raras', 'rare_diseases')
WHERE 'doencas_raras' = ANY(verticals);

UPDATE hospitals
SET verticals = array_replace(verticals, 'oncologia', 'oncology')
WHERE 'oncologia' = ANY(verticals);

UPDATE hospital_specialties SET vertical = 'venomous_animals'
WHERE vertical = 'animais_peconhentos';

UPDATE hospital_specialties SET vertical = 'rare_diseases'
WHERE vertical = 'doencas_raras';

UPDATE hospital_specialties SET vertical = 'oncology'
WHERE vertical = 'oncologia';

-- Sanity: every legacy key must be gone.
DO $$
DECLARE
    leftover_h INT;
    leftover_s INT;
BEGIN
    SELECT count(*) INTO leftover_h FROM hospitals
        WHERE verticals && ARRAY['animais_peconhentos','doencas_raras','oncologia'];
    SELECT count(*) INTO leftover_s FROM hospital_specialties
        WHERE vertical IN ('animais_peconhentos','doencas_raras','oncologia');
    IF leftover_h > 0 OR leftover_s > 0 THEN
        RAISE EXCEPTION
            'Rename incomplete: hospitals=% specialties=% still reference legacy keys',
            leftover_h, leftover_s;
    END IF;
    RAISE NOTICE
        '012_rename_verticals_to_en: hospitals=% specialties=% migrated',
        (SELECT count(*) FROM hospitals
            WHERE verticals && ARRAY['venomous_animals','rare_diseases','oncology']),
        (SELECT count(*) FROM hospital_specialties
            WHERE vertical IN ('venomous_animals','rare_diseases','oncology'));
END $$;

COMMIT;

-- =========================================================================
-- Rollback:
--
--   BEGIN;
--   UPDATE hospitals SET verticals = array_replace(verticals, 'venomous_animals', 'animais_peconhentos')
--     WHERE 'venomous_animals' = ANY(verticals);
--   UPDATE hospitals SET verticals = array_replace(verticals, 'rare_diseases', 'doencas_raras')
--     WHERE 'rare_diseases' = ANY(verticals);
--   UPDATE hospitals SET verticals = array_replace(verticals, 'oncology', 'oncologia')
--     WHERE 'oncology' = ANY(verticals);
--   UPDATE hospital_specialties SET vertical = 'animais_peconhentos' WHERE vertical = 'venomous_animals';
--   UPDATE hospital_specialties SET vertical = 'doencas_raras'       WHERE vertical = 'rare_diseases';
--   UPDATE hospital_specialties SET vertical = 'oncologia'           WHERE vertical = 'oncology';
--   COMMIT;
-- =========================================================================
