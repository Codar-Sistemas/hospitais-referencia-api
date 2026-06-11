-- ============================================================================
-- 016 — Oncology vertical: national source seed
-- ============================================================================
-- Three national files from the CGCAN page. The main file's URL is DATED
-- (…-abril-2026.xlsx — changes on every monthly update); the oncology runner
-- re-resolves the current URLs by scraping the official page on every run and
-- keeps `vertical_sources.url` as "last known URL". ON CONFLICT DO NOTHING so
-- re-running this migration never overwrites a runner-refreshed URL.
--
-- Rollback: DELETE FROM vertical_sources WHERE vertical = 'oncology';

BEGIN;

INSERT INTO vertical_sources (vertical, source_key, url, description) VALUES
    (
        'oncology',
        'oncology_qualifications',
        'https://www.gov.br/saude/pt-br/composicao/saes/cgcan/arquivos/hospitais-habilitados-em-oncologia-abril-2026.xlsx',
        'Hospitais habilitados em oncologia (CACON, UNACON, radioterapia) — arquivo BIFF/.xls com extensão .xlsx; URL datada, re-resolvida pelo runner'
    ),
    (
        'oncology',
        'breast_reconstruction',
        'https://www.gov.br/saude/pt-br/composicao/saes/cgcan/arquivos/hospitais-habilitados-em-reconstrucao-mamaria.xlsx',
        'Hospitais habilitados em reconstrução mamária pós-mastectomia (17.23)'
    ),
    (
        'oncology',
        'synchronous_treatment',
        'https://www.gov.br/saude/pt-br/composicao/saes/cgcan/arquivos/tratamento-sincronico.xlsx',
        'Hospitais habilitados em tratamentos integrados sincrônicos (17.22)'
    )
ON CONFLICT (vertical, source_key) DO NOTHING;

COMMENT ON COLUMN vertical_sources.url IS
    'Última URL conhecida do arquivo. Runners com fonte de URL datada (oncology) re-resolvem a partir da página oficial e atualizam esta coluna a cada run.';

COMMIT;
