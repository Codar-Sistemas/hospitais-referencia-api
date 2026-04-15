-- ============================================================================
-- 004_metrics.sql — Observabilidade da API
-- ============================================================================
-- Tabela para registrar cada requisição à API em formato estruturado.
-- Permite análise de uso, error rate, performance e hit rate de cache
-- direto via SQL no Supabase Studio — sem dependências externas.
--
-- Insert é fire-and-forget (não bloqueia a resposta da API).
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_metrics (
    id              BIGSERIAL PRIMARY KEY,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Requisição
    rota            TEXT NOT NULL,           -- ex: /v1/hospitais
    metodo          TEXT NOT NULL DEFAULT 'GET',
    status          INTEGER NOT NULL,        -- HTTP status code
    duracao_ms      INTEGER,                 -- tempo total de processamento

    -- Contexto
    ip_hash         TEXT,                    -- SHA-256 do IP (anonimizado p/ LGPD)
    user_agent      TEXT,
    uf              CHAR(2),                 -- UF consultada (quando aplicável)

    -- Observabilidade interna
    cache_hit       BOOLEAN,                 -- hit em cep_cache ou resposta do CDN
    rate_limited    BOOLEAN DEFAULT FALSE,   -- requisição bloqueada por rate limit
    erro_tipo       TEXT,                    -- tipo de erro (quando status >= 400)
    erro_msg        TEXT                     -- mensagem curta (sem stack trace)
);

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS idx_api_metrics_criado_em
    ON api_metrics (criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_api_metrics_rota
    ON api_metrics (rota, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_api_metrics_status
    ON api_metrics (status, criado_em DESC)
    WHERE status >= 400;

-- RLS: apenas service_role escreve. Ninguém lê pela anon key (dados de uso são internos).
ALTER TABLE api_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metrics_service_write" ON api_metrics;
CREATE POLICY "metrics_service_write" ON api_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- VIEWS de análise — prontas para consulta no Supabase Studio
-- ============================================================================

-- Visão geral das últimas 24h
CREATE OR REPLACE VIEW metrics_24h AS
SELECT
    COUNT(*)                                                AS total_requisicoes,
    COUNT(*) FILTER (WHERE status < 400)                    AS sucessos,
    COUNT(*) FILTER (WHERE status >= 400 AND status < 500)  AS erros_cliente,
    COUNT(*) FILTER (WHERE status >= 500)                   AS erros_servidor,
    COUNT(*) FILTER (WHERE rate_limited)                    AS rate_limited,
    COUNT(DISTINCT ip_hash)                                 AS ips_distintos,
    ROUND(AVG(duracao_ms)::numeric, 1)                      AS duracao_media_ms,
    ROUND(
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duracao_ms)::numeric,
        1
    )                                                       AS duracao_p95_ms
FROM api_metrics
WHERE criado_em > NOW() - INTERVAL '24 hours';

-- Top rotas mais acessadas nas últimas 24h
CREATE OR REPLACE VIEW metrics_rotas_24h AS
SELECT
    rota,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE status >= 400)                   AS erros,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status >= 400) / NULLIF(COUNT(*), 0),
        2
    )                                                       AS taxa_erro_pct,
    ROUND(AVG(duracao_ms)::numeric, 1)                      AS duracao_media_ms
FROM api_metrics
WHERE criado_em > NOW() - INTERVAL '24 hours'
GROUP BY rota
ORDER BY total DESC;

-- Hit rate do cache (para rotas que usam cache_hit)
CREATE OR REPLACE VIEW metrics_cache_24h AS
SELECT
    rota,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE cache_hit = true)                AS hits,
    COUNT(*) FILTER (WHERE cache_hit = false)               AS misses,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE cache_hit = true)
             / NULLIF(COUNT(*) FILTER (WHERE cache_hit IS NOT NULL), 0),
        2
    )                                                       AS hit_rate_pct
FROM api_metrics
WHERE criado_em > NOW() - INTERVAL '24 hours'
  AND cache_hit IS NOT NULL
GROUP BY rota
ORDER BY total DESC;

-- Erros recentes (últimas 100 falhas)
CREATE OR REPLACE VIEW metrics_erros_recentes AS
SELECT
    criado_em,
    rota,
    status,
    erro_tipo,
    erro_msg,
    duracao_ms
FROM api_metrics
WHERE status >= 400
ORDER BY criado_em DESC
LIMIT 100;

-- Requisições por hora (últimas 48h) — para detectar picos
CREATE OR REPLACE VIEW metrics_por_hora AS
SELECT
    DATE_TRUNC('hour', criado_em)                           AS hora,
    COUNT(*)                                                AS total,
    COUNT(*) FILTER (WHERE status >= 400)                   AS erros,
    COUNT(DISTINCT ip_hash)                                 AS ips_distintos
FROM api_metrics
WHERE criado_em > NOW() - INTERVAL '48 hours'
GROUP BY hora
ORDER BY hora DESC;

-- ============================================================================
-- LIMPEZA automática — mantém apenas 30 dias de histórico
-- ============================================================================
-- Função chamada periodicamente para não deixar a tabela crescer indefinidamente.
-- Pode ser agendada via GitHub Actions (mesmo job do sync) ou pg_cron.

CREATE OR REPLACE FUNCTION limpar_metricas_antigas()
RETURNS INTEGER AS $$
DECLARE
    linhas_removidas INTEGER;
BEGIN
    DELETE FROM api_metrics
    WHERE criado_em < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS linhas_removidas = ROW_COUNT;
    RETURN linhas_removidas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
