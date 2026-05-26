const { track, normalizeRoute } = require('../lib/metrics');

function createTracker({ req, res, ip, userAgent, startTime }) {
  return function trackRequest(route, extras = {}) {
    track({
      route: normalizeRoute(route),
      method: req.method,
      status: res.statusCode,
      duration_ms: Date.now() - startTime,
      ip,
      user_agent: userAgent,
      ...extras,
    });
  };
}

module.exports = { createTracker };
