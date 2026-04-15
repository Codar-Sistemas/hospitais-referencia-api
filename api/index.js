/**
 * API pública — Hospitais de Referência para Animais Peçonhentos
 *
 * Stack: Vercel serverless (Node.js) + Supabase REST
 *
 * Endpoints:
 *   GET /v1/estados
 *        Lista os 27 estados com meta de sincronização.
 *
 *   GET /v1/estados/:uf
 *        Detalhes da UF (data de atualização, total de hospitais).
 *
 *   GET /v1/hospitais?uf=SP&atendimento=crotalico&municipio=Campinas&q=santa+casa&limit=50&offset=0
 *        Busca de hospitais com filtros combinados.
 *        - uf:           CHAR(2), obrigatório se municipio não for passado
 *        - municipio:    match case-insensitive
 *        - atendimento:  um dos tipos canônicos (sem acento, lowercase aceito)
 *        - q:            full-text em unidade + endereço
 *        - limit:        máx 500 (default 100)
 *        - offset:       paginação
 *
 *   GET /v1/hospitais/:id
 *        Hospital específico por id.
 *
 * Respostas: JSON, CORS liberado (*), cache 10 min no edge.
 */

const { track, normalizeRoute } = require('./metrics');
const { BrasilApiCepProvider } = require('./providers/cep');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Provider de CEP (singleton — instanciado uma vez por cold start)
const cepProvider = new BrasilApiCepProvider({
  userAgent:
    'hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)',
});

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const RATE_LIMIT = 15;       // requisições por janela
const RATE_WINDOW = 60;      // janela em segundos

// Retorna { allowed: bool, count: number, remaining: number }
async function checkRateLimit(ip) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return { allowed: true, count: 0, remaining: RATE_LIMIT };

  const window = Math.floor(Date.now() / (RATE_WINDOW * 1000));
  const key = `rl:${ip}:${window}`;

  try {
    // Pipeline: INCR + EXPIRE em uma única chamada HTTP
    const r = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, RATE_WINDOW],
      ]),
    });
    const [incrResult] = await r.json();
    const count = incrResult.result;
    return { allowed: count <= RATE_LIMIT, count, remaining: Math.max(0, RATE_LIMIT - count) };
  } catch {
    // Se o Upstash estiver fora, deixa passar (fail open)
    return { allowed: true, count: 0, remaining: RATE_LIMIT };
  }
}

const TIPOS_CANONICOS = {
  // Termos técnicos (sem acento)
  'botropico':    'Botrópico',
  'crotalico':    'Crotálico',
  'elapidico':    'Elapídico',
  'laquetico':    'Laquético',
  'escorpionico': 'Escorpiônico',
  'loxoscelico':  'Loxoscélico',
  'foneutrico':   'Foneutrico',
  'lonomico':     'Lonômico',
  // Aliases pelo nome do animal (para usuários comuns)
  'bothrops':         'Botrópico',
  'jararaca':         'Botrópico',
  'cobra':            'Botrópico',
  'cascavel':         'Crotálico',
  'crotalus':         'Crotálico',
  'coral':            'Elapídico',
  'micrurus':         'Elapídico',
  'surucucu':         'Laquético',
  'lachesis':         'Laquético',
  'escorpiao':        'Escorpiônico',
  'escorpion':        'Escorpiônico',
  'tityus':           'Escorpiônico',
  'aranha':           'Loxoscélico',
  'aranha marrom':    'Loxoscélico',
  'loxosceles':       'Loxoscélico',
  'armadeira':        'Foneutrico',
  'aranha armadeira': 'Foneutrico',
  'phoneutria':       'Foneutrico',
  'lagarta':          'Lonômico',
  'lonomia':          'Lonômico',
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeTipo(s) {
  if (!s) return null;
  const k = stripAccents(s).toLowerCase().trim();
  return TIPOS_CANONICOS[k] || null;
}

async function sb(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
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
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
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

// Grava no cep_cache usando service key (ignora RLS)
async function cacheCep(data) {
  if (!SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cep_cache`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify(data),
    });
  } catch {
    // falha silenciosa — o cache é best-effort
  }
}

// Consulta CEP: primeiro no cache local (Supabase), depois no provider
async function consultarCep(cepRaw) {
  const cep = (cepRaw || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  // 1. Tenta o cache
  try {
    const cached = await sb('cep_cache', { select: '*', cep: `eq.${cep}`, limit: '1' });
    if (cached && cached.length > 0) {
      const c = cached[0];
      return { cep, cidade: c.cidade, uf: c.uf, bairro: c.bairro, logradouro: c.logradouro, lat: c.lat, lng: c.lng };
    }
  } catch {
    // cache indisponível — segue para o provider
  }

  // 2. Delega para o provider (default: BrasilAPI v2)
  const result = await cepProvider.lookup(cep);
  if (!result) return null;

  // Salva no cache de forma assíncrona (não bloqueia a resposta)
  cacheCep(result);
  return result;
}

function json(res, status, body, { cacheSeconds = 60 } = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // private: browser pode cachear mas o CDN do Vercel não — necessário para rate limiting funcionar
  res.setHeader(
    'Cache-Control',
    status === 200 ? `private, max-age=${cacheSeconds}` : 'no-store'
  );
  res.end(JSON.stringify(body));
}

function error(res, status, message) {
  json(res, status, { error: { status, message } }, { cacheSeconds: 0 });
}

// Rotas ------------------------------------------------------------------

async function listEstados(req, res) {
  const rows = await sb('estados', {
    select: 'uf,nome,atualizado_em,sincronizado_em,total_hospitais',
    order: 'uf.asc',
  });
  json(res, 200, { estados: rows });
}

async function getEstado(req, res, uf) {
  uf = uf.toUpperCase();
  const rows = await sb('estados', { select: '*', uf: `eq.${uf}` });
  if (!rows.length) return error(res, 404, `Estado '${uf}' não encontrado`);
  json(res, 200, rows[0]);
}

async function listHospitais(req, res, url) {
  const p = url.searchParams;

  const uf = (p.get('uf') || '').toUpperCase() || null;
  const municipio = p.get('municipio') || p.get('cidade') || null;
  const atendimentoRaw = p.get('atendimento');
  const q = p.get('q');
  const limit = Math.min(parseInt(p.get('limit') || '100', 10), 500);
  const offset = Math.max(parseInt(p.get('offset') || '0', 10), 0);

  if (!uf && !municipio && !q) {
    return error(res, 400,
      'Informe ao menos um filtro: uf, municipio ou q. Ex: /v1/hospitais?uf=SP');
  }

  const params = {
    select: 'id,uf,municipio,unidade,endereco,telefones,cnes,atendimentos,lat,lng',
    order: 'municipio.asc,unidade.asc',
    limit: String(limit),
    offset: String(offset),
  };

  if (uf)        params.uf = `eq.${uf}`;
  if (municipio) params.municipio_norm = `ilike.*${stripAccents(municipio).toLowerCase()}*`;

  if (atendimentoRaw) {
    const canonical = normalizeTipo(atendimentoRaw);
    if (!canonical) {
      const canonicos = [...new Set(Object.values(TIPOS_CANONICOS))].join(', ');
      return error(res, 400,
        `Atendimento inválido: '${atendimentoRaw}'. Valores aceitos: ${canonicos}`);
    }
    // PostgREST: filtro em array usando operador cs (contains)
    params.atendimentos = `cs.{"${canonical}"}`;
  }

  if (q) {
    // Full-text em português (índice GIN já configurado)
    params.or = `(unidade.ilike.*${q}*,endereco.ilike.*${q}*)`;
  }

  const rows = await sb('hospitais', params);
  json(res, 200, {
    filtros: { uf, municipio, atendimento: atendimentoRaw, q, limit, offset },
    total_retornados: rows.length,
    hospitais: rows,
  });
}

async function getHospital(req, res, id) {
  const n = parseInt(id, 10);
  if (!n) return error(res, 400, 'ID inválido');
  const rows = await sb('hospitais', { select: '*', id: `eq.${n}` });
  if (!rows.length) return error(res, 404, `Hospital ${n} não encontrado`);
  json(res, 200, rows[0]);
}

/**
 * Busca de hospitais por proximidade geográfica.
 *
 * Aceita três modos de informar o ponto de origem:
 *   - lat=-23.5&lng=-46.6   (coordenadas diretas)
 *   - cep=13280000          (resolvido via BrasilAPI)
 *   - cidade=Campinas&uf=SP (fallback: busca por município, sem distância)
 *
 * Filtros adicionais (opcionais): raio (metros), atendimento, limit.
 */
async function listHospitaisProximos(req, res, url) {
  const p = url.searchParams;

  let lat = p.get('lat') ? parseFloat(p.get('lat')) : null;
  let lng = p.get('lng') ? parseFloat(p.get('lng')) : null;
  const cep = p.get('cep');
  const cidade = p.get('cidade');
  let uf = (p.get('uf') || '').toUpperCase() || null;

  const raio = Math.min(parseInt(p.get('raio') || '50000', 10), 200000); // até 200km
  const limit = Math.min(parseInt(p.get('limit') || '20', 10), 100);
  const atendimentoRaw = p.get('atendimento');

  let atendimentoCanonical = null;
  if (atendimentoRaw) {
    atendimentoCanonical = normalizeTipo(atendimentoRaw);
    if (!atendimentoCanonical) {
      const canonicos = [...new Set(Object.values(TIPOS_CANONICOS))].join(', ');
      return error(res, 400,
        `Atendimento inválido: '${atendimentoRaw}'. Valores aceitos: ${canonicos}`);
    }
  }

  // Resolve origem: CEP > lat/lng > cidade
  let origem = null;
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    origem = { lat, lng, fonte: 'coords' };
  } else if (cep) {
    const cepData = await consultarCep(cep);
    if (!cepData) {
      return error(res, 404, `CEP '${cep}' não encontrado`);
    }
    if (cepData.lat && cepData.lng) {
      origem = {
        lat: cepData.lat,
        lng: cepData.lng,
        fonte: 'cep',
        cep: cepData,
      };
    } else {
      // CEP sem coordenadas: cai pra busca por cidade
      uf = uf || cepData.uf;
      origem = {
        fonte: 'cep_sem_coords',
        cep: cepData,
        cidade_fallback: cepData.cidade,
      };
    }
  } else if (cidade) {
    origem = { fonte: 'cidade' };
  } else {
    return error(res, 400,
      'Informe ao menos um de: lat+lng, cep, ou cidade. ' +
      'Ex: /v1/hospitais/proximos?cep=13280000&raio=50000');
  }

  // Caso 1: temos coordenadas → usa RPC hospitais_proximos
  if (origem.lat && origem.lng) {
    const rows = await sbRpc('hospitais_proximos', {
      p_lat: origem.lat,
      p_lng: origem.lng,
      p_raio_m: raio,
      p_uf: uf,
      p_atendimento: atendimentoCanonical,
      p_limit: limit,
    });
    return json(res, 200, {
      origem,
      raio_m: raio,
      total_retornados: rows.length,
      hospitais: rows.map(h => ({
        ...h,
        distancia_km: Math.round((h.distancia_m / 1000) * 10) / 10,
      })),
    });
  }

  // Caso 2: busca por cidade (sem distância)
  const cidadeBusca =
    (origem.fonte === 'cep_sem_coords' && origem.cep && origem.cep.cidade) || cidade;

  if (!cidadeBusca) {
    return error(res, 400, 'Não foi possível determinar uma cidade para busca.');
  }

  const cidadeNorm = stripAccents(cidadeBusca).toLowerCase();
  const params = {
    select: 'id,uf,municipio,unidade,endereco,telefones,cnes,atendimentos,lat,lng',
    municipio_norm: `ilike.*${cidadeNorm}*`,
    order: 'municipio.asc,unidade.asc',
    limit: String(limit),
  };
  if (uf) params.uf = `eq.${uf}`;
  if (atendimentoCanonical) params.atendimentos = `cs.{"${atendimentoCanonical}"}`;

  const rows = await sb('hospitais', params);
  return json(res, 200, {
    origem: { ...origem, cidade_busca: cidadeBusca },
    total_retornados: rows.length,
    hospitais: rows,
    aviso: 'Resultados por cidade (sem ordenação por distância).',
  });
}

// Handler Vercel ---------------------------------------------------------

module.exports = async (req, res) => {
  const inicio = Date.now();

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const userAgent = req.headers['user-agent'] || null;

  // Helper para gravar métrica ao final de cada resposta (fire-and-forget)
  const trackReq = (rota, extras = {}) => {
    track({
      rota: normalizeRoute(rota),
      metodo: req.method,
      status: res.statusCode,
      duracao_ms: Date.now() - inicio,
      ip,
      user_agent: userAgent,
      ...extras,
    });
  };

  if (req.method !== 'GET') {
    error(res, 405, 'Método não permitido');
    trackReq(req.url || '/', { erro_tipo: 'method_not_allowed' });
    return;
  }

  const rl = await checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  res.setHeader('X-RateLimit-Window', `${RATE_WINDOW}s`);

  if (!rl.allowed) {
    res.setHeader('Retry-After', RATE_WINDOW);
    error(res, 429,
      `Limite de ${RATE_LIMIT} requisições por ${RATE_WINDOW}s excedido. ` +
      `Aguarde e tente novamente. Dica: cache as respostas na sua aplicação.`
    );
    trackReq(req.url || '/', { rate_limited: true, erro_tipo: 'rate_limit' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '');
  const ufParam = url.searchParams.get('uf');

  let ufCapturada = ufParam;

  try {
    // Roteamento simples
    if (path === '' || path === '/' || path === '/v1') {
      json(res, 200, {
        nome: 'hospitais-referencia-api',
        versao: '1.1',
        fonte: 'Ministério da Saúde - gov.br/saude',
        docs: 'https://hospitais-referencia-web.vercel.app/docs',
        repositorio: 'https://github.com/Codar-Sistemas/hospitais-referencia-api',
        aviso_uso: [
          'Esta é uma API pública, gratuita e mantida de forma voluntária.',
          'Use com responsabilidade: o volume de consultas deve refletir o uso real de um usuário.',
          'Não faça requisições em loop ou varreduras automatizadas.',
          'Em caso de alto volume, considere cachear as respostas na sua aplicação.',
          'Dependências gratuitas: Supabase, Vercel, BrasilAPI, Nominatim/OpenStreetMap.',
        ],
        endpoints: [
          'GET /v1/estados',
          'GET /v1/estados/:uf',
          'GET /v1/hospitais?uf=SP&atendimento=crotalico',
          'GET /v1/hospitais/:id',
          'GET /v1/hospitais/proximos?cep=13280000&raio=50000',
          'GET /v1/hospitais/proximos?lat=-23.5&lng=-46.6&atendimento=elapidico',
          'GET /v1/hospitais/proximos?cidade=Campinas&uf=SP',
        ],
      });
    } else if (path === '/v1/estados') {
      await listEstados(req, res);
    } else if (/^\/v1\/estados\/([A-Za-z]{2})$/.test(path)) {
      const uf = path.match(/^\/v1\/estados\/([A-Za-z]{2})$/)[1];
      ufCapturada = uf.toUpperCase();
      await getEstado(req, res, uf);
    } else if (path === '/v1/hospitais') {
      await listHospitais(req, res, url);
    } else if (path === '/v1/hospitais/proximos') {
      await listHospitaisProximos(req, res, url);
    } else if (/^\/v1\/hospitais\/(\d+)$/.test(path)) {
      const id = path.match(/^\/v1\/hospitais\/(\d+)$/)[1];
      await getHospital(req, res, id);
    } else {
      error(res, 404, `Rota não encontrada: ${path}`);
    }

    trackReq(path || '/', {
      uf: ufCapturada,
      erro_tipo: res.statusCode >= 400 ? `http_${res.statusCode}` : null,
    });
  } catch (e) {
    console.error(e);
    if (!res.writableEnded) {
      error(res, 500, e.message || 'Erro interno');
    }
    trackReq(path || '/', {
      uf: ufCapturada,
      erro_tipo: 'exception',
      erro_msg: e.message,
    });
  }
};
