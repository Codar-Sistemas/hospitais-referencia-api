// /llms.txt — emergent standard for AI engines (llmstxt.org).
// Plain text, served at the root, gives ChatGPT/Gemini/Perplexity
// a concise "TL;DR" of the site they can cite from.

export const dynamic = 'force-static';

const SITE = 'https://hospitais-referencia-web.vercel.app';
const API = 'https://hospitais-referencia-api.vercel.app';

const CONTENT = `# Hospitais de Referência para Animais Peçonhentos

> Diretório público dos hospitais brasileiros habilitados a tratar acidentes com animais peçonhentos (cobras, escorpiões, aranhas, lagartas). Dados oficiais do Ministério da Saúde, atualizados todos os dias. Custo zero, gratuito, sem cadastro.

A ferramenta agrega os PDFs publicados em gov.br/saude para cada um dos 27 estados, extrai as tabelas de hospitais habilitados pelo SUS a aplicar soros antiofídicos e antivenenos, e expõe os dados via API REST pública e site de busca em português.

## Site

- [Busca por cidade, CEP ou animal](${SITE}/): formulário principal para o público geral
- [Consulta para profissionais](${SITE}/profissionais): tabela técnica com CNES, telefone, grade completa de soros e mapa
- [Estatísticas públicas](${SITE}/stats): demanda agregada, resiliência do sync, cobertura geográfica
- [Documentação da API](${SITE}/docs): exemplos curl, parâmetros, formato de resposta
- [Termos de uso](${SITE}/termos)

## API REST (gratuita, sem autenticação)

- [GET /v1/states](${API}/v1/states): lista das 27 UFs com data da última atualização
- [GET /v1/hospitals](${API}/v1/hospitals): busca por state_code, city, treatment, q
- [GET /v1/hospitals/nearby](${API}/v1/hospitals/nearby): busca por proximidade (cep, lat+lng ou city)
- [GET /v1/stats](${API}/v1/stats): agregados de uso e cobertura

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
