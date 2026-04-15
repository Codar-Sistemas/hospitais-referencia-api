/**
 * Observabilidade — registra cada requisição na tabela api_metrics.
 *
 * Fire-and-forget: a chamada nunca bloqueia nem falha a resposta da API.
 * Se o Supabase estiver fora, os dados daquela requisição são perdidos —
 * é uma troca consciente (logs observáveis, não auditoria).
 *
 * IP é armazenado como SHA-256 (anonimização para LGPD).
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Salt fixo (via env) — garante que o mesmo IP sempre vira o mesmo hash,
// mas ninguém consegue reverter sem o salt. Gere um valor aleatório na Vercel.
const IP_SALT = process.env.METRICS_IP_SALT || 'hospitais-referencia-default-salt';

function hashIp(ip) {
  if (!ip || ip === 'unknown') return null;
  return crypto
    .createHash('sha256')
    .update(IP_SALT + ip)
    .digest('hex')
    .substring(0, 16); // primeiros 16 chars já são suficientes p/ deduplicar
}

/**
 * Registra uma requisição. Chamar ao final do handler, antes de enviar a resposta.
 *
 * @param {object} params
 * @param {string} params.rota          — ex: '/v1/hospitais'
 * @param {string} [params.metodo]      — default 'GET'
 * @param {number} params.status        — HTTP status code
 * @param {number} params.duracao_ms    — duração em ms
 * @param {string} [params.ip]          — IP bruto (será hasheado)
 * @param {string} [params.user_agent]
 * @param {string} [params.uf]          — UF consultada, se aplicável
 * @param {boolean} [params.cache_hit]
 * @param {boolean} [params.rate_limited]
 * @param {string} [params.erro_tipo]
 * @param {string} [params.erro_msg]
 */
function track(params) {
  // Silenciosamente não faz nada se faltam credenciais
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const body = {
    rota: params.rota,
    metodo: params.metodo || 'GET',
    status: params.status,
    duracao_ms: params.duracao_ms ?? null,
    ip_hash: hashIp(params.ip),
    user_agent: params.user_agent ? String(params.user_agent).substring(0, 256) : null,
    uf: params.uf || null,
    cache_hit: typeof params.cache_hit === 'boolean' ? params.cache_hit : null,
    rate_limited: !!params.rate_limited,
    erro_tipo: params.erro_tipo || null,
    erro_msg: params.erro_msg ? String(params.erro_msg).substring(0, 500) : null,
  };

  // Fire-and-forget: NÃO use await. Se der erro, apenas loga no console da função.
  fetch(`${SUPABASE_URL}/rest/v1/api_metrics`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error('[metrics] falha ao registrar métrica:', err.message);
  });
}

/**
 * Normaliza uma rota para análise — substitui IDs por placeholders.
 * Ex: '/v1/hospitais/42' → '/v1/hospitais/:id'
 *     '/v1/estados/SP'  → '/v1/estados/:uf'
 */
function normalizeRoute(path) {
  return path
    .replace(/^\/+|\/+$/g, '/')
    .replace(/\/v1\/hospitais\/\d+$/, '/v1/hospitais/:id')
    .replace(/\/v1\/estados\/[A-Za-z]{2}$/, '/v1/estados/:uf');
}

module.exports = { track, normalizeRoute };
