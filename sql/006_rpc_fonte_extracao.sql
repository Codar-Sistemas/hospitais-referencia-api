-- ============================================================================
-- 006_rpc_fonte_extracao.sql — Expõe fonte_extracao na RPC hospitais_proximos
-- ============================================================================
-- Atualiza a função RPC para retornar fonte_extracao, confianca_ocr e
-- requer_verificacao — permitindo que o frontend exiba o badge de
-- verificação para hospitais extraídos via OCR.
-- ============================================================================

-- Drop + recreate necessário: mudamos o RETURNS TABLE (novas colunas)
DROP FUNCTION IF EXISTS hospitais_proximos(
    DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, TEXT, TEXT, INTEGER
);

CREATE OR REPLACE FUNCTION hospitais_proximos(
    p_lat    DOUBLE PRECISION,
    p_lng    DOUBLE PRECISION,
    p_raio_m INTEGER DEFAULT 50000,
    p_uf     TEXT    DEFAULT NULL,
    p_atendimento TEXT DEFAULT NULL,
    p_limit  INTEGER DEFAULT 50
)
RETURNS TABLE (
    id                  INTEGER,
    uf                  CHAR(2),
    municipio           TEXT,
    unidade             TEXT,
    endereco            TEXT,
    telefones           TEXT,
    cnes                TEXT,
    atendimentos        TEXT[],
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    distancia_m         DOUBLE PRECISION,
    fonte_extracao      TEXT,
    confianca_ocr       SMALLINT,
    requer_verificacao  BOOLEAN
)
LANGUAGE sql STABLE AS $$
    SELECT
        h.id, h.uf, h.municipio, h.unidade, h.endereco, h.telefones,
        h.cnes, h.atendimentos, h.lat, h.lng,
        earth_distance(
            ll_to_earth(h.lat, h.lng),
            ll_to_earth(p_lat, p_lng)
        ) AS distancia_m,
        h.fonte_extracao,
        h.confianca_ocr,
        h.requer_verificacao
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

-- Re-grant (função foi recriada)
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
