-- =========================================================================
-- Roles and grants — mirror the Supabase role setup locally.
--
-- On managed Supabase, these roles (anon, authenticated, authenticator,
-- service_role) already exist. Locally we must create them by hand.
-- This file is only loaded by docker-compose (never deployed).
-- =========================================================================

-- 1) anon: role used by requests carrying the anonymous apikey (read-only)
DO $$ BEGIN
    CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) authenticated: logged-in users (unused in dev, but PostgREST expects it)
DO $$ BEGIN
    CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) service_role: bypasses RLS (used by the sync script)
DO $$ BEGIN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) authenticator: login role PostgREST uses to switch into the others
DO $$ BEGIN
    CREATE ROLE authenticator LOGIN PASSWORD 'authpass' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO authenticator;

-- Schema permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Read access for anon/authenticated on existing and future tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon, authenticated;

-- service_role: full access
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- Function-level grants are applied by the migrations themselves
-- (002_geocoding.sql and 007_rename_to_english.sql), so nothing extra here.
