-- ============================================================================
-- 005_fonte_extracao.sql — Rastreabilidade da origem dos dados
-- ============================================================================
-- Adiciona metadados sobre como cada hospital foi extraído do PDF do MS.
-- Usado quando alguns estados publicam PDFs escaneados (sem camada de texto),
-- exigindo OCR via Tesseract — cujos dados devem ser destacados no frontend
-- como "requer verificação".
-- ============================================================================

-- Fonte de extração: PDF com texto estruturado vs PDF escaneado (OCR)
ALTER TABLE hospitais
    ADD COLUMN IF NOT EXISTS fonte_extracao TEXT NOT NULL DEFAULT 'pdf_texto'
        CHECK (fonte_extracao IN ('pdf_texto', 'pdf_ocr'));

-- Confiança do OCR (0-100) — média das confidences do Tesseract.
-- NULL para registros extraídos de pdf_texto.
ALTER TABLE hospitais
    ADD COLUMN IF NOT EXISTS confianca_ocr SMALLINT
        CHECK (confianca_ocr IS NULL OR (confianca_ocr >= 0 AND confianca_ocr <= 100));

-- Flag computada: indica se o registro veio de OCR e deve ser exibido
-- com aviso de verificação no frontend.
ALTER TABLE hospitais
    ADD COLUMN IF NOT EXISTS requer_verificacao BOOLEAN
        GENERATED ALWAYS AS (fonte_extracao = 'pdf_ocr') STORED;

-- Índice parcial: filtrar rapidamente hospitais que precisam de verificação
CREATE INDEX IF NOT EXISTS idx_hospitais_requer_verificacao
    ON hospitais (uf)
    WHERE requer_verificacao = true;

-- ============================================================================
-- Backfill: todos os hospitais existentes vieram de pdf_texto
-- (o default já garante isso para inserts novos, mas documentamos explicitamente)
-- ============================================================================
UPDATE hospitais
SET fonte_extracao = 'pdf_texto'
WHERE fonte_extracao IS NULL;

-- ============================================================================
-- Novo status para o enum de estados.status
-- Adiciona 'ok_ocr' como variante de sucesso quando a extração foi via OCR.
-- ============================================================================
-- PostgreSQL não tem "ALTER TYPE ADD VALUE IF NOT EXISTS" para check constraints
-- em colunas TEXT, então atualizamos via DROP/ADD da constraint se existir.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'estados' AND column_name = 'status'
    ) THEN
        -- Aceita os status existentes + 'ok_ocr'
        ALTER TABLE estados DROP CONSTRAINT IF EXISTS estados_status_check;
    END IF;

    ALTER TABLE estados
        ADD CONSTRAINT estados_status_check
        CHECK (status IN ('ok', 'ok_ocr', 'erro', 'nao_suportado', 'pendente'));
EXCEPTION WHEN OTHERS THEN
    -- Se a constraint não existia, não faz mal
    NULL;
END$$;
