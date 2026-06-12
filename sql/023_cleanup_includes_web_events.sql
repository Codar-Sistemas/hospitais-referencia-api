-- 023: cleanup_old_metrics also purges web_events (Terms compliance)
--
-- The Terms of Use promise telemetry is "apagada automaticamente após 30 dias".
-- cleanup_old_metrics() only deleted api_metrics; web_events (which also stores
-- ip_hash) was never purged. Extend the function to delete from BOTH, so the
-- promise is actually kept once the cleanup workflow runs it on schedule.
--
-- CREATE OR REPLACE resets function attributes, so the search_path pin (017)
-- and the execute grants are re-applied here to stay idempotent and safe.

BEGIN;

CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rows_removed INTEGER;
    web_removed  INTEGER;
BEGIN
    DELETE FROM api_metrics WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS rows_removed = ROW_COUNT;

    DELETE FROM web_events WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS web_removed = ROW_COUNT;

    RETURN rows_removed + web_removed;
END;
$$;

-- Only the cron (service_role) may run it — never anon/authenticated.
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM anon;
REVOKE EXECUTE ON FUNCTION cleanup_old_metrics() FROM authenticated;
GRANT  EXECUTE ON FUNCTION cleanup_old_metrics() TO service_role;

COMMIT;
