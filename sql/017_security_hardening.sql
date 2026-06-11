-- 017: Security Advisor hardening
--
-- Addresses the genuine findings from the Supabase Security Advisor:
--   1. RLS Disabled in Public → public.hospital_specialties  (THE real one)
--   2. cleanup_old_metrics(): SECURITY DEFINER callable by anon + mutable search_path
--   3. Mutable search_path on nearby_hospitals / set_hospital_specialties_updated_at
--
-- NOT addressed (acceptable by design):
--   * "Security Definer View" on metrics_*/v_* — these expose ONLY aggregates of
--     internal tables (api_metrics, sync_logs). SECURITY DEFINER is what lets the
--     public /v1/stats endpoint read aggregates without granting anon SELECT on the
--     raw rows. Converting to security_invoker would break /stats. Left as-is.
--   * Extensions cube/earthdistance in public — moving them breaks the `<@>`
--     operator used by nearby_hospitals. Negligible risk. Left as-is.
--
-- Idempotent. Safe to run multiple times.

BEGIN;

-- 1) hospital_specialties was created (009) WITHOUT RLS. With RLS disabled,
--    PostgREST honours the default anon grants → anon could write. Enable RLS
--    (default-deny) and add a public READ policy. service_role bypasses RLS,
--    so the sync pipeline keeps writing. Matches hospitais/estados (001) and
--    vertical_sources (015).
ALTER TABLE hospital_specialties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hospital_specialties: public read" ON hospital_specialties;
CREATE POLICY "hospital_specialties: public read"
    ON hospital_specialties FOR SELECT USING (true);

-- 2) cleanup_old_metrics() is SECURITY DEFINER and deletes rows. Lock its
--    search_path and ensure only the cron (service_role) can execute it.
ALTER FUNCTION cleanup_old_metrics() SET search_path = public;
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM authenticated;
GRANT  EXECUTE ON FUNCTION cleanup_old_metrics() TO service_role;

-- 3) Pin search_path on the remaining flagged functions. cube/earthdistance
--    live in public, so `public` is sufficient for nearby_hospitals' operators.
ALTER FUNCTION set_hospital_specialties_updated_at() SET search_path = public;

DO $$
BEGIN
    -- nearby_hospitals is overloaded across migrations; pin every signature.
    EXECUTE (
        SELECT string_agg(
            format('ALTER FUNCTION %s SET search_path = public;',
                   oid::regprocedure), ' ')
        FROM pg_proc
        WHERE proname = 'nearby_hospitals'
          AND pronamespace = 'public'::regnamespace
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'nearby_hospitals search_path pin skipped: %', SQLERRM;
END $$;

COMMIT;
