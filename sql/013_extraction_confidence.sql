-- =========================================================================
-- 013_extraction_confidence.sql
-- =========================================================================
-- Redefine `hospitals.requires_verification` so the manual-check badge
-- reflects extraction provenance AND quality:
--
--   pdf_text                       → never flagged (deterministic)
--   pdf_ocr                        → always flagged (Tesseract is noisy)
--   llm_gemini / llm_groq          → flagged when ocr_confidence < 70
--   anything else / NULL           → flagged (be conservative)
--
-- `ocr_confidence` is reused as a generic 0-100 score so the LLM path
-- can write into the same column the OCR path already populates.
--
-- Reversible — see rollback recipe at the bottom.
-- =========================================================================

BEGIN;

-- Widen the extraction_source allowlist before anything else writes to
-- it. The previous CHECK constraint only knew about pdf_text / pdf_ocr.
ALTER TABLE hospitals
    DROP CONSTRAINT IF EXISTS hospitals_extraction_source_check;
ALTER TABLE hospitals
    ADD CONSTRAINT hospitals_extraction_source_check
    CHECK (extraction_source IN ('pdf_text', 'pdf_ocr', 'llm_gemini', 'llm_groq', 'xlsx'));

-- Drop the index, both dependent views and the column, redefine the
-- column, then rebuild views + index. The views are deterministic
-- aggregates over the same tables so recreating them is safe.

DROP INDEX IF EXISTS idx_hospitals_requires_verification;
DROP VIEW IF EXISTS v_coverage_by_state;
DROP VIEW IF EXISTS v_hospitals_all;

ALTER TABLE hospitals DROP COLUMN IF EXISTS requires_verification;

ALTER TABLE hospitals
    ADD COLUMN requires_verification BOOLEAN
    GENERATED ALWAYS AS (
        extraction_source = 'pdf_ocr'
        OR (
            extraction_source IN ('llm_gemini', 'llm_groq')
            AND COALESCE(ocr_confidence, 0) < 70
        )
    ) STORED;

CREATE INDEX idx_hospitals_requires_verification
    ON hospitals (requires_verification)
    WHERE requires_verification = true;

-- Recreate dependent views with identical signatures.

CREATE OR REPLACE VIEW v_coverage_by_state AS
SELECT
    s.state_code,
    s.name,
    s.total_hospitals,
    s.status,
    s.synced_at,
    COUNT(h.id) AS hospitals_count,
    COUNT(h.id) FILTER (WHERE h.lat IS NOT NULL AND h.lng IS NOT NULL) AS geocoded_count,
    COUNT(h.id) FILTER (WHERE h.requires_verification) AS ocr_records
FROM states s
LEFT JOIN hospitals h ON h.state_code = s.state_code
GROUP BY s.state_code, s.name, s.total_hospitals, s.status, s.synced_at
ORDER BY s.state_code;

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

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT ON v_coverage_by_state TO anon;
        GRANT SELECT ON v_hospitals_all     TO anon;
    END IF;
END
$grant$;

COMMENT ON COLUMN hospitals.requires_verification IS
    'TRUE when the row needs a human spot-check before being shown without a badge: every Tesseract row, plus LLM rows whose heuristic ocr_confidence dropped below 70.';

COMMENT ON COLUMN hospitals.ocr_confidence IS
    '0-100 confidence score. For pdf_ocr rows: mean Tesseract per-word confidence. For llm_* rows: structural heuristic (well-formed CNES + canonical treatments + non-null name/address).';

COMMIT;

-- =========================================================================
-- Rollback recipe (run manually to undo this migration):
--
--   BEGIN;
--   DROP INDEX IF EXISTS idx_hospitals_requires_verification;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS requires_verification;
--   ALTER TABLE hospitals
--       ADD COLUMN requires_verification BOOLEAN
--       GENERATED ALWAYS AS (extraction_source = 'pdf_ocr') STORED;
--   CREATE INDEX idx_hospitals_requires_verification
--       ON hospitals (requires_verification)
--       WHERE requires_verification = true;
--   COMMIT;
-- =========================================================================
