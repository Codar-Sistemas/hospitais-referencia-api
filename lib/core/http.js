function json(res, status, body, { cacheSeconds = 60 } = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // private: browsers may cache, but Vercel's CDN must not — needed for rate limiting to work
  res.setHeader('Cache-Control', status === 200 ? `private, max-age=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body));
}

function error(res, status, message) {
  json(res, status, { error: { status, message } }, { cacheSeconds: 0 });
}

module.exports = { json, error };
