// Thin REST/RPC client. We deliberately avoid `@supabase/supabase-js` —
// it pulls in auth/realtime/storage that the API never uses.
// Reads use the anon key (RLS-protected); writes use the service key.

export const SUPABASE_URL: string | undefined = process.env['SUPABASE_URL'];
const SUPABASE_ANON_KEY: string | undefined = process.env['SUPABASE_ANON_KEY'];
export const SUPABASE_SERVICE_KEY: string | undefined = process.env['SUPABASE_SERVICE_KEY'];

// Supabase managed exposes REST at `<url>/rest/v1`; local PostgREST serves
// straight from `<url>/`. SUPABASE_REST_URL overrides this for local dev.
export const REST_BASE: string =
  process.env['SUPABASE_REST_URL'] ?? `${SUPABASE_URL ?? ''}/rest/v1`;

export type SbParams = Record<string, string | number | undefined | null>;

// The generic `<T>` documents the row shape the caller expects — there is
// no runtime validation, so it must match the actual columns.
export async function sb<T>(path: string, params: SbParams = {}): Promise<T[]> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is not configured');
  }
  const url = new URL(`${REST_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
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
  return (await r.json()) as T[];
}

// Read via the service key. Used by read-only endpoints that aggregate
// internal tables (e.g. /v1/stats over api_metrics / sync_logs): those views
// are `security_invoker = on`, so anon would lack access to the raw tables.
// service_role bypasses RLS and the key stays server-side (never reaches the
// browser). The response carries aggregates only — no PII — and is CDN-cached.
export async function sbService<T>(path: string, params: SbParams = {}): Promise<T[]> {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY is not configured');
  }
  const url = new URL(`${REST_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!r.ok) {
    throw new Error(`Supabase error ${r.status}: ${await r.text()}`);
  }
  return (await r.json()) as T[];
}

export async function sbRpc<T>(fn: string, body: Record<string, unknown>): Promise<T[]> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY is not configured');
  }
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
  return (await r.json()) as T[];
}

// Skips conflicts silently — sync pipelines re-run idempotently.
export async function sbInsert(table: string, data: unknown): Promise<globalThis.Response | null> {
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

// Merge upsert: existing rows are overwritten by the new payload.
// Required to enrich stale cache rows — e.g. a CEP previously stored
// without coordinates that we now resolved via Nominatim.
export async function sbUpsert(
  table: string,
  data: unknown,
  onConflict?: string,
): Promise<globalThis.Response | null> {
  if (!SUPABASE_SERVICE_KEY) return null;
  const url = new URL(`${REST_BASE}/${table}`);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);
  return fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
}
