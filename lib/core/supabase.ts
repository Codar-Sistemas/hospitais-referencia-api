/**
 * Thin Supabase REST/RPC client. Tiny by design — we don't pull the
 * `@supabase/supabase-js` SDK because it bundles auth, realtime, storage
 * and other surfaces we never use on the API side.
 *
 * Reads go through the anon key (RLS-protected). Writes use the service
 * key and bypass RLS — only the sync pipeline and the metrics middleware
 * call those helpers.
 */

export const SUPABASE_URL: string | undefined = process.env['SUPABASE_URL'];
const SUPABASE_ANON_KEY: string | undefined = process.env['SUPABASE_ANON_KEY'];
export const SUPABASE_SERVICE_KEY: string | undefined = process.env['SUPABASE_SERVICE_KEY'];

/**
 * Supabase managed exposes REST at `<url>/rest/v1`; local PostgREST serves
 * straight from `<url>/`. Allow overriding the base via env for local dev.
 */
export const REST_BASE: string =
  process.env['SUPABASE_REST_URL'] ?? `${SUPABASE_URL ?? ''}/rest/v1`;

export type SbParams = Record<string, string | number | undefined | null>;

/**
 * GET against PostgREST. The generic `<T>` documents the row shape the
 * caller expects — there is no runtime validation, so keep it honest.
 */
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

/** Calls a Postgres function via PostgREST's `/rpc/<fn>` endpoint. */
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

/**
 * Best-effort insert with the service key. Skips conflicts silently —
 * used by the sync pipeline to seed states/specialties idempotently.
 */
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

/**
 * Upsert with merge semantics — existing rows are overwritten by the new
 * payload. Required when re-running an expensive lookup (e.g. a CEP that
 * now has coordinates) to replace a stale cache entry that had nulls.
 */
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
