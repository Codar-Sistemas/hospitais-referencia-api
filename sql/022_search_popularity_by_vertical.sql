-- 022: Per-vertical search popularity
--
-- v_treatment_popularity_30d (008) only counts `treatment_searched`, which is
-- set for the venomous vertical (serum types). Rare-diseases and oncology
-- searches filter by `disease`, which wasn't recorded — so their "most
-- searched" was invisible. Record `disease_searched` and expose ONE view that
-- folds both filters into (vertical, filter_value, searches) so /estatisticas
-- can show a "most searched" breakdown per area.
--
-- security_invoker like the other stats views (018). Aggregates only — no PII.
-- Idempotent.

BEGIN;

ALTER TABLE api_metrics
    ADD COLUMN IF NOT EXISTS disease_searched TEXT;

CREATE INDEX IF NOT EXISTS idx_api_metrics_disease_searched
    ON api_metrics (disease_searched, created_at DESC)
    WHERE disease_searched IS NOT NULL;

-- One row per (vertical, searched filter value). COALESCE picks whichever
-- filter the vertical uses — treatment for venomous, disease otherwise.
CREATE OR REPLACE VIEW v_search_popularity_by_vertical_30d
WITH (security_invoker = on) AS
SELECT
    COALESCE(vertical, 'venomous_animals')            AS vertical,
    COALESCE(treatment_searched, disease_searched)    AS filter_value,
    COUNT(*)::INTEGER                                 AS searches
FROM api_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
  AND COALESCE(treatment_searched, disease_searched) IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, searches DESC;

COMMENT ON VIEW v_search_popularity_by_vertical_30d IS
    'Most-searched filter value per vertical (treatment for venomous, disease for rare/oncology) over the last 30 days.';

COMMIT;
