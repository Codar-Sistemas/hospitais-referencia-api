const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const isConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function pipeline(commands) {
  if (!isConfigured) return null;
  const r = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  return r.json();
}

module.exports = { pipeline, isConfigured };
