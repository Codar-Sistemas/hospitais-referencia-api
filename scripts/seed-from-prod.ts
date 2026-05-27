// Read-only against the production API; writes to the local Supabase with
// the service key. Every row is tagged `verticals = ['venomous_animals']`
// so the multi-vertical schema looks realistic from the first second.
//
//   npm run seed -- SP RJ MG
//   PROD_API=https://other-deploy.vercel.app npm run seed

import type { Hospital, StateCode } from '../lib/types/domain.js';

type ProdHospital = Pick<
  Hospital,
  | 'state_code'
  | 'city'
  | 'name'
  | 'address'
  | 'phones'
  | 'cnes'
  | 'treatments'
  | 'treatments_raw'
  | 'lat'
  | 'lng'
  | 'geocoding_status'
  | 'geocoding_source'
  | 'geocoded_at'
  | 'extraction_source'
>;

interface ProdResponse {
  hospitals?: ProdHospital[];
  data?: ProdHospital[];
}

const PROD_API = process.env['PROD_API'] ?? 'https://hospitais-referencia-api.vercel.app';
const LOCAL_SB = process.env['SUPABASE_URL'];
const SERVICE_KEY = process.env['SUPABASE_SERVICE_KEY'];

if (!LOCAL_SB || !SERVICE_KEY) {
  console.error(
    '[seed] SUPABASE_URL / SUPABASE_SERVICE_KEY must be set (point at the local stack).',
  );
  process.exit(1);
}

const STATES = process.argv.slice(2).filter(Boolean) as StateCode[];
if (STATES.length === 0) STATES.push('SP' as StateCode, 'RJ' as StateCode, 'MG' as StateCode);

async function fetchProdHospitals(state: StateCode): Promise<ProdHospital[]> {
  const url = `${PROD_API}/v1/hospitals?state_code=${state}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`prod fetch ${state} failed: ${res.status}`);
  const json = (await res.json()) as ProdResponse;
  return json.hospitals ?? json.data ?? [];
}

async function upsertLocal(rows: ProdHospital[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((h) => ({
    state_code: h.state_code,
    city: h.city,
    name: h.name,
    address: h.address ?? null,
    phones: h.phones ?? null,
    cnes: h.cnes ?? null,
    treatments: h.treatments ?? [],
    treatments_raw: h.treatments_raw ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    geocoding_status: h.geocoding_status ?? null,
    geocoding_source: h.geocoding_source ?? null,
    geocoded_at: h.geocoded_at ?? null,
    extraction_source: h.extraction_source ?? 'pdf_text',
    verticals: ['venomous_animals'],
  }));

  const res = await fetch(`${LOCAL_SB}/rest/v1/hospitals`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`local upsert failed ${res.status}: ${text.slice(0, 300)}`);
  }
  const inserted = (await res.json()) as unknown[];
  return inserted.length;
}

// hospital_specialties isn't populated by this seed — print the SQL to
// run afterwards so the multi-vertical API has rows to serve.
function printBackfillReminder(): void {
  const sql = `
    INSERT INTO hospital_specialties (hospital_id, vertical, specialty, source_url, metadata)
    SELECT h.id, 'venomous_animals', t, COALESCE(h.extraction_source, 'seed_from_prod'),
           jsonb_build_object('seeded_at', NOW())
    FROM hospitals h, unnest(h.treatments) t
    ON CONFLICT DO NOTHING;
  `;
  console.log('\n[seed] Run the following in psql to backfill specialties:\n');
  console.log(sql);
}

async function main(): Promise<void> {
  console.log(`[seed] PROD=${PROD_API}`);
  console.log(`[seed] LOCAL=${LOCAL_SB ?? '(unset)'}`);
  console.log(`[seed] States: ${STATES.join(', ')}\n`);

  for (const state of STATES) {
    process.stdout.write(`  ${state}: fetching prod… `);
    const rows = await fetchProdHospitals(state);
    process.stdout.write(`${rows.length} rows → upserting local… `);
    const n = await upsertLocal(rows);
    console.log(`inserted ${n}`);
  }

  printBackfillReminder();
  console.log('\n[seed] done.');
}

main().catch((e: unknown) => {
  console.error('[seed] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
