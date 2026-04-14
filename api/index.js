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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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

// Consulta CEP via BrasilAPI — retorna {cidade, uf, lat, lng}
async function consultarCep(cepRaw) {
  const cep = (cepRaw || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
      headers: { 'User-Agent': 'hospitais-referencia-api/1.0' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const coords = (data.location && data.location.coordinates) || {};
    return {
      cep,
      cidade: data.city || null,
      uf: data.state || null,
      bairro: data.neighborhood || null,
      logradouro: data.street || null,
      lat: coords.latitude ? parseFloat(coords.latitude) : null,
      lng: coords.longitude ? parseFloat(coords.longitude) : null,
    };
  } catch {
    return null;
  }
}

function json(res, status, body, { cacheSeconds = 600 } = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Cache-Control',
    status === 200 ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60` : 'no-store'
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
  const municipio = p.get('municipio');
  const atendimentoRaw = p.get('atendimento');
  const q = p.get('q');
  const limit = Math.min(parseInt(p.get('limit') || '100', 10), 500);
  const offset = Math.max(parseInt(p.get('offset') || '0', 10), 0);

  if (!uf && !municipio && !q) {
    return error(res, 400,
      'Informe ao menos um filtro: uf, municipio ou q. Ex: /v1/hospitais?uf=SP');
  }

  const params = {
    select: 'id,uf,municipio,unidade,endereco,telefones,cnes,atendimentos',
    order: 'municipio.asc,unidade.asc',
    limit: String(limit),
    offset: String(offset),
  };

  if (uf)        params.uf = `eq.${uf}`;
  if (municipio) params.municipio = `ilike.*${municipio}*`;

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
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'GET') return error(res, 405, 'Método não permitido');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/+$/, '');

  try {
    // Roteamento simples
    if (path === '' || path === '/' || path === '/v1') {
      return json(res, 200, {
        nome: 'hospitais-referencia-api',
        versao: '1.1',
        fonte: 'Ministério da Saúde - gov.br/saude',
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
    }

    if (path === '/v1/estados') return listEstados(req, res);

    let m;
    if ((m = path.match(/^\/v1\/estados\/([A-Za-z]{2})$/))) {
      return getEstado(req, res, m[1]);
    }

    if (path === '/v1/hospitais') return listHospitais(req, res, url);

    if (path === '/v1/hospitais/proximos') return listHospitaisProximos(req, res, url);

    if ((m = path.match(/^\/v1\/hospitais\/(\d+)$/))) {
      return getHospital(req, res, m[1]);
    }

    return error(res, 404, `Rota não encontrada: ${path}`);
  } catch (e) {
    console.error(e);
    return error(res, 500, e.message || 'Erro interno');
  }
};
