function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
}

function handlePreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  applyCors(res);
  res.statusCode = 204;
  res.end();
  return true;
}

module.exports = { applyCors, handlePreflight };
