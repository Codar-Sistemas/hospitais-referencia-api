-- =========================================================================
-- Migration 003: cache persistente de geocoding (Nominatim)
--
-- Evita chamadas repetidas ao Nominatim para queries já vistas em runs
-- anteriores. Cada query string enviada ao Nominatim é armazenada com o
-- resultado (lat/lng) ou como miss explícito (lat IS NULL).
--
-- Para forçar re-geocoding de endereços que falharam anteriormente:
--   DELETE FROM geocode_cache WHERE lat IS NULL;
-- =========================================================================

CREATE TABLE IF NOT EXISTS geocode_cache (
    query_key   TEXT PRIMARY KEY,           -- query exata enviada ao Nominatim
    lat         FLOAT8,                     -- NULL = miss confirmado (Nominatim não encontrou)
    lng         FLOAT8,
    fonte       TEXT DEFAULT 'nominatim',
    hit_count   INTEGER NOT NULL DEFAULT 1, -- quantas vezes essa entrada foi consultada
    criado_em   TIMESTAMPTZ DEFAULT NOW(),
    ultimo_hit  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para limpeza periódica de entradas antigas
CREATE INDEX IF NOT EXISTS idx_geocode_cache_criado ON geocode_cache (criado_em);

-- RLS: service_role escreve, anon lê (para eventual debug via Supabase Studio)
ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geocode_cache_select_anon"
    ON geocode_cache FOR SELECT TO anon USING (true);

CREATE POLICY "geocode_cache_all_service"
    ON geocode_cache FOR ALL TO service_role USING (true);
