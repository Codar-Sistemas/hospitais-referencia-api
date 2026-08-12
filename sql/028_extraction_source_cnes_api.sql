-- =========================================================================
-- 028_extraction_source_cnes_api.sql
-- =========================================================================
-- Fase 2 do roadmap CNES-first: as verticais coletadas do registro oficial
-- (CAPS via API DEMAS + serviços do site do CNES) gravam
-- extraction_source = 'cnes_api'. Alarga o CHECK da 013.
--
-- `requires_verification` (027) não precisa mudar: a expressão só flaga
-- pdf_ocr e llm_* — linhas 'cnes_api' nascem sem selo de verificação, o que
-- é o comportamento correto para fonte oficial estruturada.
-- =========================================================================

BEGIN;

ALTER TABLE hospitals
    DROP CONSTRAINT IF EXISTS hospitals_extraction_source_check;
ALTER TABLE hospitals
    ADD CONSTRAINT hospitals_extraction_source_check
    CHECK (extraction_source IN (
        'pdf_text', 'pdf_ocr', 'llm_gemini', 'llm_groq', 'xlsx', 'cnes_api'
    ));

COMMIT;

-- =========================================================================
-- Rollback (apenas se nenhuma linha 'cnes_api' existir):
--
--   BEGIN;
--   ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_extraction_source_check;
--   ALTER TABLE hospitals
--       ADD CONSTRAINT hospitals_extraction_source_check
--       CHECK (extraction_source IN ('pdf_text', 'pdf_ocr', 'llm_gemini', 'llm_groq', 'xlsx'));
--   COMMIT;
-- =========================================================================
