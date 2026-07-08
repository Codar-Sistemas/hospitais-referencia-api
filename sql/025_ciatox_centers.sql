-- ============================================================================
-- 025 — CIATOX centers: toxicology emergency-phone directory (new vertical)
-- ============================================================================
-- In early July 2026 the Ministry of Health unpublished the per-state
-- "Hospitais de Referência" pages of the venomous-animals programme (every
-- state URL now redirects to a Plone login wall). The official section points
-- to the CIATOX page instead — an HTML list of toxicology centers per UF with
-- emergency phone numbers. This table holds that directory: one row per
-- CENTER, not per state (SP lists 9 centers, PR 4, PB 2). Not every UF has a
-- center — the page currently covers 20 of the 27.
--
-- Sync state lives in `vertical_sources` (national-source pattern, like
-- rare_diseases/oncology): one page covering every UF at once, so `states`
-- does not fit.
--
-- Rollback:
--   DROP TABLE ciatox_centers;
--   DELETE FROM vertical_sources WHERE vertical = 'ciatox';

BEGIN;

CREATE TABLE IF NOT EXISTS ciatox_centers (
    id              SERIAL PRIMARY KEY,
    state_code      CHAR(2) NOT NULL REFERENCES states(state_code) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    -- Primary emergency number in display format ("0800-280-3661",
    -- "(92) 3305-4702"). Nullable: the source occasionally lists a center
    -- before its emergency line is filled in.
    emergency_phone TEXT,
    -- Additional numbers, order as published: secondary emergency numbers
    -- first, then the "Telefone:" list. Annotations like "(Ramal 5853)" or
    -- "(whatsapp)" are preserved — they matter to callers.
    phones          TEXT[] NOT NULL DEFAULT '{}',
    source_url      TEXT NOT NULL,
    synced_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Diff key for the sync upserter (there is no CNES for these centers).
    CONSTRAINT ciatox_centers_state_name_key UNIQUE (state_code, name)
);

CREATE INDEX IF NOT EXISTS idx_ciatox_centers_state ON ciatox_centers(state_code);

-- Same RLS posture as hospitals/states: public read, writes only via
-- service_role (which bypasses RLS — nothing else to grant).
ALTER TABLE ciatox_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ciatox_centers: public read" ON ciatox_centers;
CREATE POLICY "ciatox_centers: public read"
    ON ciatox_centers FOR SELECT USING (true);

-- Register the national source page (URL lives in data, not code — a gov.br
-- URL change is a one-line SQL fix, no deploy needed).
INSERT INTO vertical_sources (vertical, source_key, url, description) VALUES
    (
        'ciatox',
        'ciatox_page',
        'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/ciatox',
        'Centros de Informação e Assistência Toxicológica (CIATOX) — lista oficial por UF com telefones de emergência'
    )
ON CONFLICT (vertical, source_key) DO NOTHING;

COMMIT;
