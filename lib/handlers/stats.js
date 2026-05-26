const { json } = require('../core/http');
const { sb } = require('../core/supabase');

// Public aggregated stats — powers the /stats page.
// All queries hit pre-built SQL views (see sql/008_metrics_phase1.sql).
// No PII; safe to cache in the CDN for a few minutes.
async function getStats(req, res) {
  const [overview, demand, treatments, timeline, resilience, coverage] = await Promise.all([
    sb('v_search_stats_30d', { select: '*', limit: '1' }),
    sb('v_demand_by_user_state', { select: '*' }),
    sb('v_treatment_popularity_30d', { select: '*' }),
    sb('v_search_timeline_30d', { select: '*' }),
    sb('v_sync_resilience_90d', { select: '*', limit: '1' }),
    sb('v_coverage_by_state', { select: '*' }),
  ]);

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');

  json(res, 200, {
    generated_at: new Date().toISOString(),
    overview: overview[0] || null,
    demand_by_user_state: demand,
    treatment_popularity_30d: treatments,
    search_timeline_30d: timeline,
    sync_resilience_90d: resilience[0] || null,
    coverage_by_state: coverage,
  });
}

module.exports = { getStats };
