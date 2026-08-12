-- =========================================================================
-- 027_cnes_confirmation.sql
-- =========================================================================
-- Fase 1 do roadmap CNES-first: registrar o resultado da comparação de cada
-- hospital extraído (PDF/OCR/LLM) contra o registro oficial no CNES (API
-- DEMAS), e deixar a confirmação oficial derrubar o selo de verificação
-- manual:
--
--   cnes_confirmed    → o registro oficial bate com o extraído em pelo
--                       menos um sinal forte (telefone ou coordenadas) e
--                       nenhum sinal diverge. Escrito pelo batch
--                       scripts/enrichment (nunca à mão).
--   cnes_divergences  → campos onde o oficial contradiz o extraído
--                       (ex.: {phone,coords}). NULL = nunca comparado;
--                       '{}' = comparado e limpo.
--   cnes_checked_at   → quando a última comparação rodou (frescor
--                       granular da checagem, por linha).
--
-- `requires_verification` passa a ser: a regra de proveniência da 013
-- E NÃO confirmado pelo registro oficial. Uma linha vinda de OCR que o
-- CNES confirma deixa de pedir verificação humana.
--
-- Reversível — receita ao final.
-- =========================================================================

BEGIN;

ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS cnes_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS cnes_divergences TEXT[];
ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS cnes_checked_at TIMESTAMPTZ;

-- Mesmo balé da 013: derrubar índice + views dependentes, recriar a coluna
-- gerada com a nova expressão e reconstruir tudo com assinatura idêntica.

DROP INDEX IF EXISTS idx_hospitals_requires_verification;
DROP VIEW IF EXISTS v_coverage_by_state;
DROP VIEW IF EXISTS v_hospitals_all;

ALTER TABLE hospitals DROP COLUMN IF EXISTS requires_verification;

ALTER TABLE hospitals
    ADD COLUMN requires_verification BOOLEAN
    GENERATED ALWAYS AS (
        (
            extraction_source = 'pdf_ocr'
            OR (
                extraction_source IN ('llm_gemini', 'llm_groq')
                AND COALESCE(ocr_confidence, 0) < 70
            )
        )
        AND NOT cnes_confirmed
    ) STORED;

CREATE INDEX idx_hospitals_requires_verification
    ON hospitals (requires_verification)
    WHERE requires_verification = true;

-- Views recriadas com assinatura idêntica à 013.

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

COMMENT ON COLUMN hospitals.cnes_confirmed IS
    'TRUE quando o registro oficial do CNES (API DEMAS) confirma a linha extraída: pelo menos um sinal forte (telefone/coordenadas) bate e nenhum diverge. Escrito por scripts/enrichment.';

COMMENT ON COLUMN hospitals.cnes_divergences IS
    'Campos em que o registro oficial contradiz o extraído (ex.: {phone,coords}). NULL = nunca comparado; vazio = comparado e limpo.';

COMMENT ON COLUMN hospitals.cnes_checked_at IS
    'Última comparação desta linha contra o registro oficial do CNES.';

COMMENT ON COLUMN hospitals.requires_verification IS
    'TRUE quando a linha pede spot-check humano: proveniência de baixa confiança (regra da 013) E ainda não confirmada pelo registro oficial do CNES (027).';

COMMIT;

-- =========================================================================
-- Receita de rollback (rodar manualmente para desfazer):
--
--   BEGIN;
--   DROP INDEX IF EXISTS idx_hospitals_requires_verification;
--   DROP VIEW IF EXISTS v_coverage_by_state;
--   DROP VIEW IF EXISTS v_hospitals_all;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS requires_verification;
--   ALTER TABLE hospitals
--       ADD COLUMN requires_verification BOOLEAN
--       GENERATED ALWAYS AS (
--           extraction_source = 'pdf_ocr'
--           OR (
--               extraction_source IN ('llm_gemini', 'llm_groq')
--               AND COALESCE(ocr_confidence, 0) < 70
--           )
--       ) STORED;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_confirmed;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_divergences;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_checked_at;
--   CREATE INDEX idx_hospitals_requires_verification
--       ON hospitals (requires_verification)
--       WHERE requires_verification = true;
--   -- recriar as views: copiar os blocos CREATE OR REPLACE VIEW da 013.
--   COMMIT;
-- =========================================================================
