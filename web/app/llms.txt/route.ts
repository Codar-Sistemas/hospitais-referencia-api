// /llms.txt — emergent standard for AI engines (llmstxt.org).
// Plain text, served at the root, gives ChatGPT/Gemini/Perplexity
// a concise "TL;DR" of the site they can cite from.

import { API_URL, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

const SITE = SITE_URL;
const API = API_URL;

const CONTENT = `# MapaSUS — Estabelecimentos de Referência do SUS

> Plataforma pública que organiza, normaliza e republica os dados oficiais do Ministério da Saúde sobre os estabelecimentos habilitados pelo SUS. Dados atualizados todos os dias. Custo zero, gratuito, sem cadastro. Três verticais em produção: animais peçonhentos (cobras, escorpiões, aranhas, lagartas), doenças raras e oncologia (CACON/UNACON), com busca cross-vertical no hub.

A plataforma agrega os documentos publicados em gov.br/saude, extrai as tabelas de estabelecimentos habilitados, geocodifica os endereços e expõe os dados via API REST pública e site de busca em português.

## Site

- [Hub MapaSUS](${SITE}/): porta de entrada da plataforma, busca cross-vertical e lista das verticais
- [Animais peçonhentos — busca por cidade, CEP ou animal](${SITE}/animais-peconhentos): hospitais com soro antiofídico/antiveneno
- [Doenças raras — serviços habilitados pelo SUS](${SITE}/doencas-raras): SRDR, atenção especializada e terapia gênica
- [Oncologia — CACON e UNACON](${SITE}/oncologia): alta complexidade, radioterapia, reconstrução mamária
- [Consulta para profissionais](${SITE}/animais-peconhentos/profissionais): tabela técnica com CNES, telefone e mapa (disponível em cada vertical)
- [Estatísticas públicas](${SITE}/estatisticas): demanda agregada, resiliência do sync, cobertura geográfica
- [Documentação da API](${SITE}/docs): exemplos curl, parâmetros, formato de resposta
- [Termos de uso](${SITE}/termos)

## API REST (gratuita, sem autenticação)

- [GET /v1/states](${API}/v1/states): lista das 27 UFs com data da última atualização
- [GET /v1/{vertical}/hospitals](${API}/v1/venomous-animals/hospitals): busca por state_code, city, q; treatment (peçonhentos) ou disease (raras, oncologia)
- [GET /v1/{vertical}/hospitals/nearby](${API}/v1/venomous-animals/hospitals/nearby): busca por proximidade (cep, lat+lng ou city)
- [GET /v1/search](${API}/v1/search): busca cross-vertical em todas as verticais ativas
- [GET /v1/stats](${API}/v1/stats): agregados de uso e cobertura

As rotas legadas \`/v1/hospitals\` continuam funcionando (vertical padrão = animais peçonhentos).

Rate limit: 15 req/min por IP. CORS liberado. JSON.

## Tipos de soro disponíveis

Bothropic (Botrópico — jararaca, urutu), Crotalic (Crotálico — cascavel), Elapidic (Elapídico — coral-verdadeira), Lachetic (Laquético — surucucu), Scorpionic (Escorpiônico), Loxoscelic (Loxoscélico — aranha marrom), Phoneutric (Foneutrico — aranha armadeira), Lonomic (Lonômico — lagarta-de-fogo), Antiarachnidic (antiveneno aracnídico polivalente).

## Em caso de emergência

Ligue para o SAMU (192) imediatamente. Esta ferramenta serve para localizar a unidade certa; o atendimento médico vem primeiro.

## Fonte oficial

Ministério da Saúde do Brasil — https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia

## Mantenedor

Codar Sistemas — https://codarsistemas.com.br · https://github.com/Codar-Sistemas/hospitais-referencia-api
`;

export function GET() {
  return new Response(CONTENT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
