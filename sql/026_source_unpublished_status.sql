-- ============================================================================
-- 026 — 'source_unpublished' status: distinguish "MS took the page down"
-- ============================================================================
-- Since ~07-08/Jul/2026 every venomous-animals state page redirects to the
-- Plone login wall (acl_users/credentials_cookie_auth/require_login). That is
-- not a fetch/parse failure — the source was unpublished. The sync now
-- classifies it as its own status so operators (and /stats) can tell "our
-- pipeline broke" from "the Ministry removed the source", and the daily job
-- can keep probing without failing.
--
-- Until this migration runs, the sync's attempts to persist the new status
-- are rejected by the old CHECKs and silently skipped (states update is
-- wrapped, sync_logs is best-effort) — the run itself still succeeds.
--
-- Rollback: recreate each constraint without 'source_unpublished'.

BEGIN;

ALTER TABLE states DROP CONSTRAINT IF EXISTS states_status_check;
ALTER TABLE states ADD CONSTRAINT states_status_check
    CHECK (status IS NULL OR status IN
        ('ok', 'ok_ocr', 'error', 'unsupported', 'pending', 'source_unpublished'));

ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_status_check;
ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_status_check
    CHECK (status IN
        ('success', 'unchanged', 'unsupported', 'failed', 'source_unpublished'));

-- vertical_sources gains the same vocabulary so national-source verticals
-- (ciatox, rare_diseases, oncology) can record an unpublished page too.
ALTER TABLE vertical_sources DROP CONSTRAINT IF EXISTS vertical_sources_status_check;
ALTER TABLE vertical_sources ADD CONSTRAINT vertical_sources_status_check
    CHECK (status IN ('ok', 'error', 'pending', 'source_unpublished'));

COMMIT;
