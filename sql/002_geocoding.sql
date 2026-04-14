-- =========================================================================
-- Migration 002: geocoding + busca por proximidade
-- =========================================================================

-- Extensões necessárias para distância em latitude/longitude.
-- Ambas são pré-instaladas no Supabase; só precisam ser ativadas.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- Coordenadas geográficas dos hospitais
ALTER TABLE hospitais
    ADD COLUMN IF NOT EXISTS lat            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng            DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geocode_status TEXT,          -- 'ok' | 'falhou' | 'pendente'
    ADD COLUMN IF NOT EXISTS geocode_fonte  TEXT,          -- 'nominatim' | 'brasilapi' | 'manual'
    ADD COLUMN IF NOT EXISTS geocode_em     TIMESTAMPTZ;

-- Município normalizado (sem acento, lowercase) para busca por cidade
ALTER TABLE hospitais
    ADD COLUMN IF NOT EXISTS municipio_norm TEXT
        GENERATED ALWAYS AS (
            lower(translate(
                municipio,
                'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
            ))
        ) STORED;

-- Índice geográfico (GiST) para queries de "hospitais próximos"
-- Usa a estrutura 'earth' (ponto em R³ a partir de lat/lng).
CREATE INDEX IF NOT EXISTS idx_hospitais_geo
    ON hospitais USING gist (ll_to_earth(lat, lng))
    WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Índice para busca por município normalizado (substring / prefixo)
CREATE INDEX IF NOT EXISTS idx_hospitais_municipio_norm
    ON hospitais (municipio_norm);

-- =========================================================================
-- Cache de CEPs consultados (evita bater na BrasilAPI toda hora)
-- =========================================================================
CREATE TABLE IF NOT EXISTS cep_cache (
    cep          CHAR(8) PRIMARY KEY,            -- sem traço, 8 dígitos
    logradouro   TEXT,
    bairro       TEXT,
    cidade       TEXT,
    uf           CHAR(2),
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,
    consultado_em TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- RPC (remote procedure) usada pelo endpoint /v1/hospitais/proximos
-- =========================================================================
-- Recebe lat/lng/raio e retorna hospitais ordenados por distância.
-- Expor via PostgREST; chamável pelo client com rpc('hospitais_proximos', ...).
CREATE OR REPLACE FUNCTION hospitais_proximos(
    p_lat    DOUBLE PRECISION,
    p_lng    DOUBLE PRECISION,
    p_raio_m INTEGER DEFAULT 50000,
    p_uf     TEXT    DEFAULT NULL,
    p_atendimento TEXT DEFAULT NULL,
    p_limit  INTEGER DEFAULT 50
)
RETURNS TABLE (
    id            INTEGER,
    uf            CHAR(2),
    municipio     TEXT,
    unidade       TEXT,
    endereco      TEXT,
    telefones     TEXT,
    cnes          TEXT,
    atendimentos  TEXT[],
    lat           DOUBLE PRECISION,
    lng           DOUBLE PRECISION,
    distancia_m   DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT
        h.id, h.uf, h.municipio, h.unidade, h.endereco, h.telefones,
        h.cnes, h.atendimentos, h.lat, h.lng,
        earth_distance(
            ll_to_earth(h.lat, h.lng),
            ll_to_earth(p_lat, p_lng)
        ) AS distancia_m
    FROM hospitais h
    WHERE h.lat IS NOT NULL
      AND h.lng IS NOT NULL
      AND earth_box(ll_to_earth(p_lat, p_lng), p_raio_m) @> ll_to_earth(h.lat, h.lng)
      AND earth_distance(ll_to_earth(h.lat, h.lng), ll_to_earth(p_lat, p_lng)) <= p_raio_m
      AND (p_uf IS NULL OR h.uf = upper(p_uf))
      AND (p_atendimento IS NULL OR p_atendimento = ANY(h.atendimentos))
    ORDER BY distancia_m ASC
    LIMIT p_limit;
$$;

-- Nota sobre GRANT EXECUTE desta função:
-- Em Supabase produção, as roles 'anon' e 'authenticated' já existem e o
-- GRANT abaixo funciona. Em Postgres puro (Docker local) as roles são
-- criadas em local_999_roles.sql, que também concede EXECUTE após criá-las.
-- O bloco condicional abaixo evita erro em qualquer ambiente.
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION hospitais_proximos TO anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION hospitais_proximos TO authenticated';
    END IF;
END
$grant$;

-- RLS no cache de CEP: leitura pública, escrita só por service_role
ALTER TABLE cep_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cep_cache: leitura pública" ON cep_cache;
CREATE POLICY "cep_cache: leitura pública" ON cep_cache FOR SELECT USING (true);
