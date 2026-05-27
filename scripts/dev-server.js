/**
 * Local dev server — wraps the Vercel-style handler at api/index.js
 * and exposes it on a plain HTTP port. Use this instead of `vercel dev`
 * when iterating locally against the Supabase CLI stack.
 *
 *   node scripts/dev-server.js          # PORT=3001 default
 *   PORT=3010 node scripts/dev-server.js
 */
require('dotenv').config({ path: '.env.local' });
const http = require('http');
const url = require('url');
const handler = require('../api/index');

const PORT = Number(process.env.PORT || 3001);

const server = http.createServer(async (req, res) => {
  // Vercel injects `req.query` from the URL; replicate that shape.
  const parsed = url.parse(req.url, true);
  req.query = parsed.query;

  // Polyfill Vercel-style response helpers (.status(), .json(), .send()).
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload) => {
    if (typeof payload === 'object' && payload !== null) return res.json(payload);
    res.end(String(payload ?? ''));
    return res;
  };

  // Buffer body for POST so handlers can read it as JSON.
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf-8');
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
  }

  try {
    await handler(req, res);
  } catch (err) {
    console.error('[dev-server] handler crashed:', err);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'internal_error', message: err.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`[dev-server] API listening on http://localhost:${PORT}`);
  console.log(`[dev-server] SUPABASE_URL = ${process.env.SUPABASE_URL || '(unset)'}`);
});
