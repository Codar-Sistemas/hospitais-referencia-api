const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Supabase managed exposes REST at `<url>/rest/v1`; local PostgREST serves
// from `<url>/`. Allow overriding the base via env for local dev.
const REST_BASE = process.env.SUPABASE_REST_URL || `${SUPABASE_URL}/rest/v1`;

async function sb(path, params = {}) {
  const url = new URL(`${REST_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!r.ok) {
    throw new Error(`Supabase error ${r.status}: ${await r.text()}`);
  }
  return r.json();
}

async function sbRpc(fn, body) {
  const url = `${REST_BASE}/rpc/${fn}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Supabase RPC ${fn} error ${r.status}: ${await r.text()}`);
  }
  return r.json();
}

async function sbInsert(table, data) {
  if (!SUPABASE_SERVICE_KEY) return null;
  return fetch(`${REST_BASE}/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(data),
  });
}

module.exports = {
  sb,
  sbRpc,
  sbInsert,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  REST_BASE,
};
