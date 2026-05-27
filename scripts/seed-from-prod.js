/**
 * Seed local Supabase with real data fetched from the production API.
 * Read-only against prod (uses the public /v1/hospitals endpoint),
 * writes locally via the Supabase REST endpoint with the service key.
 *
 *   node scripts/seed-from-prod.js [states...]   # default: SP RJ MG
 */
require('dotenv').config({ path: '.env.local' });

const PROD_API = 'https://hospitais-referencia-api.vercel.app';
const LOCAL_SB = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const STATES = process.argv.slice(2).filter(Boolean);
if (STATES.length === 0) STATES.push('SP', 'RJ', 'MG');

async function fetchProdHospitals(state) {
  const url = `${PROD_API}/v1/hospitals?state_code=${state}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`prod fetch ${state} failed: ${res.status}`);
  const json = await res.json();
  return json.hospitals || json.data || [];
}

async function upsertLocal(rows) {
  if (rows.length === 0) return 0;
  // Strip prod-only fields, keep schema-relevant ones.
  const payload = rows.map((h) => ({
    state_code: h.state_code,
    city: h.city,
    name: h.name,
    address: h.address ?? null,
    phones: h.phones ?? null,
    cnes: h.cnes ?? null,
    treatments: h.treatments || [],
    treatments_raw: h.treatments_raw ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    geocoding_status: h.geocoding_status ?? null,
    geocoding_source: h.geocoding_source ?? null,
    geocoded_at: h.geocoded_at ?? null,
    extraction_source: h.extraction_source || 'pdf_text',
    verticals: ['peconhentos'],
  }));

  const url = `${LOCAL_SB}/rest/v1/hospitals`;
  const res = await fetch(url, {
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
  const inserted = await res.json();
  return inserted.length;
}

async function backfillSpecialties() {
  // After insert, populate hospital_specialties from treatments arrays.
  const sql = `
    INSERT INTO hospital_specialties (hospital_id, vertical, specialty, source_url, metadata)
    SELECT h.id, 'peconhentos', t, COALESCE(h.extraction_source,'seed_from_prod'),
           jsonb_build_object('seeded_at', NOW())
    FROM hospitals h, unnest(h.treatments) t
    ON CONFLICT DO NOTHING;
  `;
  const url = `${LOCAL_SB}/rest/v1/rpc/exec_sql`;
  // No exec_sql RPC — instead just rely on psql separately for the backfill.
  // Print the SQL so the operator can run it.
  console.log('\n[seed] Run the following in psql to backfill specialties:\n');
  console.log(sql);
}

(async () => {
  console.log(`[seed] PROD=${PROD_API}`);
  console.log(`[seed] LOCAL=${LOCAL_SB}`);
  console.log(`[seed] States: ${STATES.join(', ')}\n`);

  for (const state of STATES) {
    process.stdout.write(`  ${state}: fetching prod… `);
    const rows = await fetchProdHospitals(state);
    process.stdout.write(`${rows.length} rows → upserting local… `);
    const n = await upsertLocal(rows);
    console.log(`inserted ${n}`);
  }

  await backfillSpecialties();
  console.log('\n[seed] done.');
})().catch((e) => {
  console.error('[seed] failed:', e.message);
  process.exit(1);
});
