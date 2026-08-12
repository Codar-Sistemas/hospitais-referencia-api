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
-- As views dependentes são capturadas e recriadas DINAMICAMENTE (definição,
-- security_invoker, grants e comment) em vez de hardcoded: a 013 recriou
-- views por cópia e a 018/021 mudaram essas definições depois — repetir a
-- cópia aqui regrediria o schema em silêncio.
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

-- ------------------------------------------------------------------------
-- 1) Capturar as views que dependem da coluna gerada, como estão no banco.
-- ------------------------------------------------------------------------
CREATE TEMP TABLE _mig027_views ON COMMIT DROP AS
SELECT
    c.relname                          AS view_name,
    pg_get_viewdef(c.oid)              AS view_def,
    c.reloptions                       AS view_reloptions,
    obj_description(c.oid, 'pg_class') AS view_comment
FROM pg_class c
WHERE c.oid IN (
    SELECT DISTINCT rw.ev_class
    FROM pg_depend d
    JOIN pg_rewrite rw   ON d.objid = rw.oid
    JOIN pg_class   src  ON d.refobjid = src.oid
    JOIN pg_attribute a  ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE src.relname = 'hospitals'
      AND a.attname = 'requires_verification'
      AND rw.ev_class <> src.oid
);

CREATE TEMP TABLE _mig027_grants ON COMMIT DROP AS
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN (SELECT view_name FROM _mig027_views)
  AND grantee <> 'postgres';

-- Sem CASCADE de propósito: se um dia existir view sobre view, é melhor a
-- migração falhar alto do que derrubar algo que não capturamos.
DO $drop$
DECLARE v RECORD;
BEGIN
    FOR v IN SELECT view_name FROM _mig027_views LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I', v.view_name);
    END LOOP;
END
$drop$;

-- ------------------------------------------------------------------------
-- 2) Trocar a coluna gerada.
-- ------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_hospitals_requires_verification;

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

-- ------------------------------------------------------------------------
-- 3) Recriar as views exatamente como estavam (reloptions/grants/comment).
-- ------------------------------------------------------------------------
DO $recreate$
DECLARE
    v RECORD;
    g RECORD;
    opts TEXT;
BEGIN
    FOR v IN SELECT view_name, view_def, view_reloptions, view_comment FROM _mig027_views LOOP
        opts := '';
        IF v.view_reloptions IS NOT NULL THEN
            opts := ' WITH (' || array_to_string(v.view_reloptions, ', ') || ')';
        END IF;
        EXECUTE format('CREATE VIEW %I%s AS %s', v.view_name, opts, v.view_def);
        IF v.view_comment IS NOT NULL THEN
            EXECUTE format('COMMENT ON VIEW %I IS %L', v.view_name, v.view_comment);
        END IF;
    END LOOP;

    FOR g IN SELECT table_name, grantee, privilege_type FROM _mig027_grants LOOP
        EXECUTE format(
            'GRANT %s ON %I TO %s',
            g.privilege_type,
            g.table_name,
            CASE WHEN g.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(g.grantee) END
        );
    END LOOP;
END
$recreate$;

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
-- Repetir a mesma dança de captura/recriação dinâmica dos blocos 1 e 3,
-- trocando o passo 2 por:
--
--   DROP INDEX IF EXISTS idx_hospitals_requires_verification;
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
--   CREATE INDEX idx_hospitals_requires_verification
--       ON hospitals (requires_verification)
--       WHERE requires_verification = true;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_confirmed;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_divergences;
--   ALTER TABLE hospitals DROP COLUMN IF EXISTS cnes_checked_at;
-- =========================================================================
