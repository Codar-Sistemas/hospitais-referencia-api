-- ============================================================================
-- 015 — Rare diseases vertical: national source registry + per-vertical logs
-- ============================================================================
-- The venomous_animals vertical tracks change-detection state in `states`
-- (one row per UF, each with its own gov.br PDF). The rare_diseases vertical
-- has a NATIONAL source instead: two XLSX files covering every UF at once,
-- so `states` does not fit. `vertical_sources` (announced in migration 012)
-- holds one row per source file per vertical. URLs live in data, not code,
-- so a gov.br URL change is a one-line SQL fix — no deploy needed.
--
-- Rollback:
--   DROP TABLE vertical_sources;
--   ALTER TABLE sync_logs DROP COLUMN vertical;

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. National (or otherwise non-per-UF) sources, one row per file.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vertical_sources (
    vertical      TEXT        NOT NULL,  -- 'rare_diseases' | future verticals
    source_key    TEXT        NOT NULL,  -- 'qualified_services' | 'gene_therapy'
    url           TEXT        NOT NULL,
    description   TEXT,
    file_hash     TEXT,                  -- SHA-256 of the last processed file
    synced_at     TIMESTAMPTZ,
    status        TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('ok', 'error', 'pending')),
    last_error    TEXT,
    total_records INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (vertical, source_key)
);

ALTER TABLE vertical_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vertical_sources: public read" ON vertical_sources;
CREATE POLICY "vertical_sources: public read"
    ON vertical_sources FOR SELECT USING (true);

INSERT INTO vertical_sources (vertical, source_key, url, description) VALUES
    (
        'rare_diseases',
        'qualified_services',
        'https://www.gov.br/saude/pt-br/composicao/saes/doencas-raras/habilitacao/servicos-habilitados.xlsx',
        'Serviços de Referência (SRDR) e Atenção Especializada (SAE) em Doenças Raras habilitados pelo SUS'
    ),
    (
        'rare_diseases',
        'gene_therapy',
        'https://www.gov.br/saude/pt-br/composicao/saes/doencas-raras/habilitacao/servicos-habilitados-terapia-genica-por-uf.xlsx',
        'Serviços de Terapia Gênica habilitados pelo SUS'
    )
ON CONFLICT (vertical, source_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. sync_logs gains a vertical discriminator. Backward-compatible: every
--    pre-existing row was written by the venomous_animals sync, so the
--    default backfills history correctly. National runs use the sentinel
--    state_code 'BR' — there is intentionally no FK from sync_logs.state_code
--    to states; adding one later would break that sentinel.
-- ----------------------------------------------------------------------------
ALTER TABLE sync_logs
    ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'venomous_animals';

CREATE INDEX IF NOT EXISTS idx_sync_logs_vertical
    ON sync_logs (vertical, started_at DESC);

COMMENT ON COLUMN sync_logs.state_code IS
    'UF of the run, or ''BR'' for national-source syncs (e.g. rare_diseases). No FK to states by design.';

COMMIT;
