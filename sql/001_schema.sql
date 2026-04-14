-- =========================================================================
-- Schema: hospitais-referencia-api
-- Hospitais de Referência para Acidentes por Animais Peçonhentos
-- Fonte: Ministério da Saúde (gov.br/saude)
-- =========================================================================

-- Tabela de estados: controla a sincronização por UF
CREATE TABLE IF NOT EXISTS estados (
    uf              CHAR(2) PRIMARY KEY,
    nome            TEXT NOT NULL,
    pagina_url      TEXT NOT NULL,              -- URL da página do estado no gov.br
    pdf_url         TEXT,                       -- URL direta do PDF mais recente
    formato         TEXT DEFAULT 'pdf',         -- 'pdf' ou 'xlsx' (Pernambuco usa XLSX)
    atualizado_em   TIMESTAMPTZ,                -- "Atualizado em" exibido na página-fonte
    sincronizado_em TIMESTAMPTZ,                -- Quando nosso sync rodou pela última vez
    pdf_hash        TEXT,                       -- SHA256 do arquivo baixado (detecta mudança de conteúdo)
    total_hospitais INTEGER DEFAULT 0,
    status          TEXT,                       -- 'ok' | 'erro' | 'nao_suportado'
    ultimo_erro     TEXT                        -- mensagem de erro da última tentativa
);

-- Tabela de hospitais: dados extraídos dos PDFs
CREATE TABLE IF NOT EXISTS hospitais (
    id                SERIAL PRIMARY KEY,
    uf                CHAR(2) NOT NULL REFERENCES estados(uf) ON DELETE CASCADE,
    municipio         TEXT NOT NULL,
    unidade           TEXT NOT NULL,
    endereco          TEXT,
    telefones         TEXT,
    cnes              TEXT,
    atendimentos      TEXT[] NOT NULL DEFAULT '{}',  -- array: ["Botrópico","Crotálico",...]
    atendimentos_raw  TEXT,                          -- texto original do PDF (referência)
    criado_em         TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_hospitais_uf           ON hospitais(uf);
CREATE INDEX IF NOT EXISTS idx_hospitais_municipio    ON hospitais(lower(municipio));
CREATE INDEX IF NOT EXISTS idx_hospitais_cnes         ON hospitais(cnes);
CREATE INDEX IF NOT EXISTS idx_hospitais_atendimentos ON hospitais USING GIN (atendimentos);

-- Busca textual em unidade/endereço (para /search)
CREATE INDEX IF NOT EXISTS idx_hospitais_fts ON hospitais
    USING GIN (to_tsvector('portuguese', coalesce(unidade,'') || ' ' || coalesce(endereco,'')));

-- =========================================================================
-- Seed: carregar os 27 estados com suas URLs
-- =========================================================================
INSERT INTO estados (uf, nome, pagina_url) VALUES
    ('AC','Acre',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/acre'),
    ('AL','Alagoas',             'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/alagoas'),
    ('AP','Amapá',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/amapa'),
    ('AM','Amazonas',            'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/amazonas'),
    ('BA','Bahia',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/bahia'),
    ('CE','Ceará',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/ceara'),
    ('DF','Distrito Federal',    'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/distrito-federal'),
    ('ES','Espírito Santo',      'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/espirito-santo'),
    ('GO','Goiás',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/goias'),
    ('MA','Maranhão',            'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/maranhao'),
    ('MT','Mato Grosso',         'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/mato-grosso'),
    ('MS','Mato Grosso do Sul',  'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/mato-grosso-do-sul'),
    ('MG','Minas Gerais',        'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/minas-gerais'),
    ('PA','Pará',                'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/para'),
    ('PB','Paraíba',             'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/paraiba'),
    ('PR','Paraná',              'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/parana'),
    ('PE','Pernambuco',          'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/pernambuco'),
    ('PI','Piauí',               'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/piaui'),
    ('RJ','Rio de Janeiro',      'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/rio-de-janeiro'),
    ('RN','Rio Grande do Norte', 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/rio-grande-do-norte'),
    ('RS','Rio Grande do Sul',   'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/rio-grande-do-sul'),
    ('RO','Rondônia',            'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/rondonia'),
    ('RR','Roraima',             'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/roraima'),
    ('SC','Santa Catarina',      'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/santa-catarina'),
    ('SP','São Paulo',           'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/sao-paulo'),
    ('SE','Sergipe',             'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/sergipe'),
    ('TO','Tocantins',           'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/tocantins')
ON CONFLICT (uf) DO NOTHING;

-- =========================================================================
-- Políticas RLS — API pública de leitura
-- =========================================================================
ALTER TABLE estados   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitais ENABLE ROW LEVEL SECURITY;

-- Qualquer um (anon key) pode ler
DROP POLICY IF EXISTS "estados: leitura pública"   ON estados;
DROP POLICY IF EXISTS "hospitais: leitura pública" ON hospitais;

CREATE POLICY "estados: leitura pública"   ON estados   FOR SELECT USING (true);
CREATE POLICY "hospitais: leitura pública" ON hospitais FOR SELECT USING (true);

-- Escrita apenas com service_role (usada pelo cron/sync)
-- (service_role bypassa RLS, nada mais a fazer)
