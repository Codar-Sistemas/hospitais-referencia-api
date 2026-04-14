-- =========================================================================
-- Roles e grants — simulam o ambiente de roles do Supabase localmente.
--
-- No Supabase gerenciado, estas roles (anon, authenticated, authenticator,
-- service_role) já existem. Localmente precisamos criá-las manualmente.
-- Este script só é carregado pelo docker-compose (não vai pra produção).
-- =========================================================================

-- 1) anon: role usada por requisições com 'apikey' anônima (só leitura)
DO $$ BEGIN
    CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) authenticated: usuários logados (não usamos em dev, mas PostgREST espera)
DO $$ BEGIN
    CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) service_role: bypassa RLS (usada pelo sync.py)
DO $$ BEGIN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) authenticator: login que o PostgREST usa para trocar para as outras
DO $$ BEGIN
    CREATE ROLE authenticator LOGIN PASSWORD 'authpass' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO authenticator;

-- Permissões no schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Leitura para anon/authenticated em todas as tabelas existentes e futuras
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon, authenticated;

-- service_role: acesso total
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- A RPC hospitais_proximos já tem GRANT em 002_geocoding.sql, mas garantimos:
GRANT EXECUTE ON FUNCTION hospitais_proximos TO anon, authenticated, service_role;
