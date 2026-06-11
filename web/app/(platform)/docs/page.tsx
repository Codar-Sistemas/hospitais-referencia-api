import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import DocsSidebar from '@/components/docs/DocsSidebar';
import { API_URL } from '@/lib/site';
import {
  LIVE_VERTICALS,
  THEME_BADGE_CLASS,
  THEME_CARD_ACCENT,
  THEME_DOT_CLASS,
} from '@/lib/verticals';

export const metadata: Metadata = {
  title: 'API Docs',
  description:
    'Documentação da API REST pública e gratuita do MapaSUS para consulta dos estabelecimentos de referência habilitados pelo SUS.',
};

const BASE = API_URL;

// ---------------------------------------------------------------------------
// Lightweight syntax highlighting (no dependency). Returns React spans so we
// never touch dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------
function highlightJson(code: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // strings (optionally a key, when followed by ":"), booleans/null, numbers.
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) nodes.push(code.slice(last, m.index));
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        nodes.push(
          <span key={key++} className="text-sky-300">
            {m[1]}
          </span>,
        );
        nodes.push(
          <span key={key++} className="text-slate-500">
            {m[2]}
          </span>,
        );
      } else {
        nodes.push(
          <span key={key++} className="text-emerald-300">
            {m[1]}
          </span>,
        );
      }
    } else if (m[3] !== undefined) {
      nodes.push(
        <span key={key++} className="text-violet-300">
          {m[3]}
        </span>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <span key={key++} className="text-amber-300">
          {m[4]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return nodes;
}

function highlightShell(code: string): ReactNode[] {
  const lines = code.split('\n');
  return lines.map((line, idx) => {
    const prefix = idx > 0 ? '\n' : '';
    const trimmed = line.trimStart();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return (
        <span key={idx} className="text-slate-500">
          {prefix}
          {line}
        </span>
      );
    }
    // Color quoted strings within the line.
    const parts: ReactNode[] = [];
    const re = /("[^"]*"|'[^']*')/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      parts.push(
        <span key={k++} className="text-amber-200">
          {m[1]}
        </span>,
      );
      last = re.lastIndex;
    }
    if (last < line.length) parts.push(line.slice(last));
    return (
      <span key={idx}>
        {prefix}
        {parts}
      </span>
    );
  });
}

type Lang = 'bash' | 'json' | 'js' | 'python';

const LANG_LABEL: Record<Lang, string> = {
  bash: 'cURL',
  json: 'JSON',
  js: 'JavaScript',
  python: 'Python',
};

function CodeBlock({ lang, label, children }: { lang: Lang; label?: string; children: string }) {
  const body = lang === 'json' ? highlightJson(children) : highlightShell(children);
  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/60 shadow-sm">
      <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
        </div>
        <span className="text-[11px] font-medium text-slate-400 tracking-wide">
          {label ?? LANG_LABEL[lang]}
        </span>
      </div>
      <pre className="bg-slate-900 text-slate-100 p-4 text-xs overflow-x-auto leading-relaxed font-mono">
        <code>{body}</code>
      </pre>
    </div>
  );
}

interface ParamDef {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

function ParamTable({ params }: { params: ParamDef[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">
              Parâmetro
            </th>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">
              Tipo
            </th>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">
              Descrição
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {params.map((p) => (
            <tr key={p.name}>
              <td className="px-4 py-2.5 font-mono text-emerald-700 font-medium whitespace-nowrap">
                {p.name}
                {p.required && <span className="text-red-500 ml-0.5">*</span>}
              </td>
              <td className="px-4 py-2.5 text-slate-500">{p.type}</td>
              <td className="px-4 py-2.5 text-slate-600">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Method({ method }: { method: string }) {
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded text-white ${
        method === 'POST' ? 'bg-blue-600' : 'bg-emerald-600'
      }`}
    >
      {method}
    </span>
  );
}

interface Example {
  label?: string;
  code: string;
}

interface EndpointProps {
  id: string;
  method: string;
  path: string;
  description: string;
  params?: ParamDef[];
  examples: Example[];
  response: string;
}

function Endpoint({ id, method, path, description, params, examples, response }: EndpointProps) {
  return (
    <div
      id={id}
      className="scroll-mt-24 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6"
    >
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
        <Method method={method} />
        <code className="text-sm font-mono text-slate-800 font-semibold break-all">{path}</code>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        {params && params.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Parâmetros
            </h4>
            <ParamTable params={params} />
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {examples.length > 1 ? 'Exemplos' : 'Exemplo'}
          </h4>
          <div className="space-y-3">
            {examples.map((ex, i) => (
              <div key={i}>
                {ex.label && (
                  <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    {ex.label}
                  </p>
                )}
                <CodeBlock lang="bash">{ex.code}</CodeBlock>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Resposta
          </h4>
          <CodeBlock lang="json">{response}</CodeBlock>
        </div>
      </div>
    </div>
  );
}

// Small reusable legend table.
function LegendTable({ rows }: { rows: { term: string; meaning: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((r) => (
            <tr key={r.term}>
              <td className="px-4 py-2.5 font-mono text-slate-800 font-medium whitespace-nowrap align-top">
                {r.term}
              </td>
              <td className="px-4 py-2.5 text-slate-600 leading-relaxed">{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Docs-only copy per vertical: which query param filters specialties and how
// to describe it. Label, slug and theme come from the registry — a new live
// vertical shows up in the docs automatically (with a sensible default note).
const FILTER_NOTES: Record<string, { param: string; paramKind: string }> = {
  'venomous-animals': { param: 'treatment', paramKind: 'tipo de soro' },
  'rare-diseases': { param: 'disease', paramKind: 'área de doença' },
  oncology: { param: 'disease', paramKind: 'tipo de serviço' },
};

const ROUTE_FORMATS: { name: string; badge?: string; desc: string; routes: string[] }[] = [
  {
    name: 'Legado',
    desc: 'Vertical implícita — recai em animais peçonhentos.',
    routes: ['GET /v1/hospitals?state_code=SP'],
  },
  {
    name: 'Namespaced',
    badge: 'Recomendado',
    desc: 'Vertical explícita no caminho da URL.',
    routes: [
      'GET /v1/venomous-animals/hospitals?state_code=SP',
      'GET /v1/rare-diseases/hospitals?disease=gene_therapy',
      'GET /v1/oncology/hospitals?disease=cacon',
    ],
  },
  {
    name: 'Cross-vertical',
    desc: 'Uma busca em todas as verticais ativas.',
    routes: ['GET /v1/search?city=Salvador'],
  },
];

// One route line on a dark strip: GET tinted, path white, query string dimmed.
function RouteLine({ route }: { route: string }) {
  const [method, rest = ''] = route.split(/ (.+)/);
  const [path, query] = rest.split(/(\?.*)/);
  return (
    <div className="whitespace-nowrap">
      <span className="text-emerald-400 font-semibold">{method}</span>{' '}
      <span className="text-slate-100">{path}</span>
      {query && <span className="text-slate-400">{query}</span>}
    </div>
  );
}

const RARE_DISEASE_KEYS = [
  'congenital_anomalies',
  'intellectual_disability',
  'inborn_metabolism_errors',
  'inflammatory_diseases',
  'infectious_diseases',
  'autoimmune_diseases',
  'other_non_genetic',
  'genetic_counseling',
  'gene_therapy',
];

const ONCOLOGY_KEYS = [
  'cacon',
  'unacon',
  'radiotherapy',
  'hematology',
  'pediatric_oncology',
  'clinical_oncology',
  'oncology_surgery',
  'synchronous_treatment',
  'breast_reconstruction',
];

const TREATMENTS = [
  { canonical: 'Bothropic', aliases: 'jararaca, cobra' },
  { canonical: 'Crotalic', aliases: 'cascavel' },
  { canonical: 'Elapidic', aliases: 'coral' },
  { canonical: 'Lachetic', aliases: 'surucucu' },
  { canonical: 'Scorpionic', aliases: 'escorpiao' },
  { canonical: 'Loxoscelic', aliases: 'aranha marrom' },
  { canonical: 'Phoneutric', aliases: 'armadeira' },
  { canonical: 'Lonomic', aliases: 'lagarta, lonomia' },
];

export default function Docs() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Documentação da API</h1>
        <p className="text-slate-500 text-sm mt-1">
          REST · pública e gratuita · sem autenticação · CORS liberado.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:gap-10">
        <DocsSidebar />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Introdução */}
          <section id="introducao" className="scroll-mt-24 mb-10">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Introdução</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              O MapaSUS republica, em JSON e com busca por proximidade, os estabelecimentos
              habilitados pelo SUS que o Ministério da Saúde publica em PDFs e planilhas. Todas as
              respostas são <code className="bg-slate-100 px-1 rounded">application/json</code>.
            </p>
            <div className="bg-slate-900 text-slate-100 rounded-xl px-5 py-3 font-mono text-sm flex flex-wrap items-center gap-3 mb-3">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Base URL</span>
              <span className="text-emerald-400 break-all">{BASE}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Rate limit', value: '15 req / min por IP' },
                { label: 'Autenticação', value: 'Nenhuma' },
                { label: 'CORS', value: 'Liberado (*)' },
                { label: 'Formato', value: 'JSON' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full"
                >
                  <span className="font-semibold text-slate-800">{label}:</span> {value}
                </div>
              ))}
            </div>
          </section>

          {/* Verticais e rotas */}
          <section id="verticais" className="scroll-mt-24 mb-10">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Verticais e rotas</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              A API cobre vários programas do SUS (&ldquo;verticais&rdquo;). As três verticais
              ativas hoje:
            </p>

            {/* Vertical cards */}
            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              {LIVE_VERTICALS.map((v) => {
                const note = FILTER_NOTES[v.slug] ?? {
                  param: 'disease',
                  paramKind: v.diseaseFilterLabel.toLowerCase(),
                };
                return (
                  <div
                    key={v.slug}
                    className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm transition-colors ${THEME_CARD_ACCENT[v.theme].ring}`}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${THEME_DOT_CLASS[v.theme]}`} />
                      <span className="font-semibold text-slate-900 text-sm leading-tight">
                        {v.label}
                      </span>
                    </div>
                    <code
                      className={`inline-block text-[11px] font-mono px-2 py-0.5 rounded-full ${THEME_BADGE_CLASS[v.theme]}`}
                    >
                      {v.slug}
                    </code>
                    <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                      Filtro:{' '}
                      <code className="font-mono text-slate-700 font-medium">{note.param}</code>{' '}
                      <span className="text-slate-400">({note.paramKind})</span>
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Route formats */}
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Formatos de rota
            </h3>
            <div className="space-y-3">
              {ROUTE_FORMATS.map((f) => (
                <div
                  key={f.name}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="px-4 pt-3.5 pb-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-slate-900 text-sm">{f.name}</span>
                      {f.badge && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded-full">
                          {f.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{f.desc}</p>
                  </div>
                  <div className="bg-slate-900 px-4 py-3 font-mono text-xs space-y-1 overflow-x-auto">
                    {f.routes.map((r) => (
                      <RouteLine key={r} route={r} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mt-4">
              Convenção: URLs em <strong>kebab-case</strong> (<code>/v1/rare-diseases</code>). O
              parâmetro <code>disease</code> só existe nas verticais baseadas em habilitação (raras,
              oncologia); a vertical default usa <code>treatment</code>. Uma chave inválida retorna{' '}
              <code>400</code> listando os valores aceitos.
            </p>
          </section>

          {/* Uso responsável */}
          <section id="uso-responsavel" className="scroll-mt-24 mb-10">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Uso responsável</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <p className="text-blue-800 text-xs leading-relaxed mb-3">
                Esta API é pública, gratuita e mantida de forma voluntária. Ela depende de serviços
                gratuitos — <strong>Supabase, Vercel, BrasilAPI e Nominatim/OpenStreetMap</strong> —
                que têm limites de uso. Por favor, contribua para que ela continue disponível para
                todos.
              </p>
              <ul className="space-y-1.5">
                {[
                  'Não faça requisições em loop ou varreduras automatizadas de dados.',
                  'Cache as respostas na sua aplicação — os dados são atualizados uma vez por dia.',
                  'O volume de consultas deve refletir o uso real de um usuário humano.',
                  'Em caso de uso intenso, considere hospedar sua própria instância (open source).',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-blue-800">
                    <svg
                      className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Filtro treatment */}
          <section id="filtro-treatment" className="scroll-mt-24 mb-8">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-semibold text-amber-900 mb-1 text-sm">
                Filtro <code className="font-mono">treatment</code> — soros (animais peçonhentos)
              </h3>
              <p className="text-xs text-amber-700 mb-4">
                Aceita o nome canônico em inglês ou aliases populares (sem acento,
                case-insensitive). Vale apenas na vertical de peçonhentos.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TREATMENTS.map(({ canonical, aliases }) => (
                  <div key={canonical} className="bg-white rounded-xl p-3 border border-amber-100">
                    <div className="font-mono font-bold text-slate-800 text-xs">{canonical}</div>
                    <div className="text-amber-700 text-xs mt-0.5">{aliases}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Filtro disease */}
          <section id="filtro-disease" className="scroll-mt-24 mb-10">
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
              <h3 className="font-semibold text-violet-900 mb-1 text-sm">
                Filtro <code className="font-mono">disease</code> — habilitações (raras, oncologia)
              </h3>
              <p className="text-xs text-violet-700 mb-4">
                Chaves canônicas aceitas por <code className="font-mono">?disease=</code> em cada
                vertical de habilitação.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-violet-800 mb-2 uppercase tracking-wide">
                    Doenças raras
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RARE_DISEASE_KEYS.map((k) => (
                      <code
                        key={k}
                        className="bg-white border border-violet-100 text-violet-800 text-[11px] px-1.5 py-0.5 rounded font-mono"
                      >
                        {k}
                      </code>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-sky-800 mb-2 uppercase tracking-wide">
                    Oncologia
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ONCOLOGY_KEYS.map((k) => (
                      <code
                        key={k}
                        className="bg-white border border-sky-100 text-sky-800 text-[11px] px-1.5 py-0.5 rounded font-mono"
                      >
                        {k}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <h2 className="text-lg font-bold text-slate-900 mb-4">Endpoints</h2>

          <Endpoint
            id="states-list"
            method="GET"
            path="/v1/states"
            description="Lista as 27 UFs com status de sincronização e total de hospitais cadastrados (vertical default)."
            examples={[{ code: `curl "${BASE}/v1/states"` }]}
            response={`{
  "states": [
    {
      "state_code": "SP",
      "name": "São Paulo",
      "updated_at": "2026-02-14T18:04:00Z",
      "synced_at": "2026-04-14T03:00:00Z",
      "total_hospitals": 242,
      "status": "ok"
    }
  ]
}`}
          />

          <Endpoint
            id="states-detail"
            method="GET"
            path="/v1/states/:state_code"
            description="Detalhes de um estado específico, incluindo URL do PDF fonte e hash SHA256."
            examples={[{ code: `curl "${BASE}/v1/states/SP"` }]}
            response={`{
  "state_code": "SP",
  "name": "São Paulo",
  "pdf_url": "https://www.gov.br/saude/...",
  "synced_at": "2026-04-14T03:00:00Z",
  "total_hospitals": 242,
  "status": "ok"
}`}
          />

          <Endpoint
            id="hospitals-list"
            method="GET"
            path="/v1/{vertical}/hospitals"
            description="Busca hospitais de uma vertical com filtros combinados. Requer ao menos state_code, city ou q. Sem o prefixo /{vertical} a busca recai na vertical default (animais peçonhentos)."
            params={[
              { name: 'state_code', type: 'string', description: 'Sigla do estado (ex: SP, RJ)' },
              { name: 'city', type: 'string', description: 'Nome da cidade (busca parcial)' },
              {
                name: 'treatment',
                type: 'string',
                description: 'Tipo de soro (vertical peçonhentos)',
              },
              {
                name: 'disease',
                type: 'string',
                description: 'Área/serviço (verticais de habilitação)',
              },
              { name: 'q', type: 'string', description: 'Full-text em name + address' },
              { name: 'limit', type: 'number', description: 'Padrão 100, máx 500' },
              { name: 'offset', type: 'number', description: 'Paginação' },
            ]}
            examples={[
              {
                label: 'Peçonhentos — por estado e animal',
                code: `curl "${BASE}/v1/venomous-animals/hospitals?state_code=SP&treatment=escorpiao"`,
              },
              {
                label: 'Oncologia — CACON em SP',
                code: `curl "${BASE}/v1/oncology/hospitals?state_code=SP&disease=cacon"`,
              },
              {
                label: 'Doenças raras — terapia gênica',
                code: `curl "${BASE}/v1/rare-diseases/hospitals?disease=gene_therapy"`,
              },
            ]}
            response={`{
  "filters": { "state_code": "SP", "disease": "cacon", "vertical": "oncology" },
  "total_returned": 14,
  "hospitals": [
    {
      "id": 1203,
      "state_code": "SP",
      "city": "São Paulo",
      "name": "Instituto do Câncer do Estado de São Paulo",
      "cnes": "2792080",
      "treatments": [],
      "specialties": [
        { "specialty": "cacon", "qualification_codes": ["17.13"] }
      ]
    }
  ]
}`}
          />

          <Endpoint
            id="hospitals-nearby"
            method="GET"
            path="/v1/{vertical}/hospitals/nearby"
            description="Hospitais ordenados por distância. Aceita CEP, coordenadas lat/lng ou cidade como origem."
            params={[
              { name: 'cep', type: 'string', description: 'CEP de 8 dígitos (resolve lat/lng)' },
              { name: 'lat', type: 'number', description: 'Latitude decimal' },
              { name: 'lng', type: 'number', description: 'Longitude decimal' },
              { name: 'city', type: 'string', description: 'Cidade (fallback sem distância)' },
              { name: 'state_code', type: 'string', description: 'Restrição opcional por estado' },
              {
                name: 'radius_m',
                type: 'number',
                description: 'Raio em metros (padrão 50k, máx 200k)',
              },
              { name: 'treatment', type: 'string', description: 'Filtro por soro (peçonhentos)' },
              {
                name: 'disease',
                type: 'string',
                description: 'Filtro por área/serviço (raras, oncologia)',
              },
              { name: 'limit', type: 'number', description: 'Padrão 20, máx 100' },
            ]}
            examples={[
              {
                label: 'Peçonhentos por CEP',
                code: `curl "${BASE}/v1/venomous-animals/hospitals/nearby?cep=13280000&treatment=crotalico"`,
              },
              {
                label: 'Oncologia por CEP — radioterapia mais próxima',
                code: `curl "${BASE}/v1/oncology/hospitals/nearby?cep=01310100&disease=radiotherapy"`,
              },
            ]}
            response={`{
  "origin": {
    "lat": -22.889, "lng": -48.445,
    "source": "cep",
    "cep": { "cep": "13280000", "city": "Vinhedo", "state_code": "SP" }
  },
  "radius_m": 50000,
  "total_returned": 3,
  "hospitals": [
    {
      "id": 42,
      "city": "Botucatu",
      "name": "Hospital das Clínicas - UNESP",
      "treatments": ["Bothropic", "Crotalic"],
      "lat": -22.894, "lng": -48.443,
      "distance_m": 612.4,
      "distance_km": 0.6
    }
  ]
}`}
          />

          <Endpoint
            id="hospitals-id"
            method="GET"
            path="/v1/hospitals/:id"
            description="Todos os dados de um hospital específico, incluindo coordenadas e status de geocoding."
            examples={[{ code: `curl "${BASE}/v1/hospitals/42"` }]}
            response={`{
  "id": 42,
  "state_code": "SP",
  "city": "Botucatu",
  "name": "Hospital das Clínicas da Faculdade de Medicina de Botucatu",
  "address": "Avenida Prof. Mario Rubens Guimarães Montenegro, s/n",
  "phones": "(14) 3811-6129",
  "cnes": "2748223",
  "treatments": ["Bothropic", "Crotalic", "Elapidic", "Lachetic"],
  "lat": -22.894, "lng": -48.443,
  "geocoding_status": "ok",
  "geocoding_source": "nominatim",
  "verticals": ["venomous_animals"]
}`}
          />

          <Endpoint
            id="search"
            method="GET"
            path="/v1/search"
            description="Busca cross-vertical: um único hospital pode aparecer com TODOS os programas SUS em que é habilitado. Útil para uma cidade, todas as áreas. Requer ao menos state_code, city ou q."
            params={[
              { name: 'state_code', type: 'string', description: 'Sigla do estado' },
              { name: 'city', type: 'string', description: 'Cidade (busca parcial)' },
              { name: 'q', type: 'string', description: 'Full-text em name + address' },
              { name: 'limit', type: 'number', description: 'Padrão 50, máx 200' },
              { name: 'offset', type: 'number', description: 'Paginação' },
            ]}
            examples={[{ code: `curl "${BASE}/v1/search?city=Salvador"` }]}
            response={`{
  "filters": { "city": "salvador", "vertical": "all" },
  "total_returned": 11,
  "hospitals": [
    {
      "id": 980,
      "state_code": "BA",
      "city": "Salvador",
      "name": "Hospital Universitário Professor Edgard Santos",
      "active_verticals": ["oncology", "rare_diseases"],
      "active_specialties": ["unacon", "breast_reconstruction", "rare_diseases_reference"]
    }
  ]
}`}
          />

          <Endpoint
            id="stats"
            method="GET"
            path="/v1/stats"
            description="Métricas públicas agregadas e anônimas (LGPD-compliant): volume de buscas, demanda por UF, resiliência dos syncs e cobertura. Cache-Control: public, max-age=300."
            examples={[{ code: `curl "${BASE}/v1/stats"` }]}
            response={`{
  "generated_at": "2026-04-14T12:00:00Z",
  "overview": {
    "total_searches": 1842,
    "distinct_users": 530,
    "avg_results_per_search": 7.3
  },
  "demand_by_user_state": [{ "state_code": "SP", "searches": 412 }],
  "coverage_by_state": [
    { "state_code": "SP", "total_hospitals": 242, "geocoded_count": 240 }
  ]
}`}
          />

          {/* Legenda dos campos */}
          <section id="legenda" className="scroll-mt-24 mt-10 mb-10">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Legenda dos campos</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              Campos que aparecem nas respostas e seus significados.
            </p>

            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Identificação por vertical
            </h3>
            <div className="mb-5">
              <LegendTable
                rows={[
                  {
                    term: 'treatments[]',
                    meaning:
                      'Soros disponíveis (apenas peçonhentos). Valores canônicos em inglês: Bothropic, Crotalic, …',
                  },
                  {
                    term: 'specialties[]',
                    meaning:
                      'Habilitações da vertical (raras, oncologia): { specialty, qualification_codes }. Ausente em peçonhentos.',
                  },
                  {
                    term: 'verticals[]',
                    meaning:
                      'Programas SUS em que o hospital está habilitado (chaves de banco: venomous_animals, rare_diseases, oncology).',
                  },
                  {
                    term: 'active_verticals[]',
                    meaning: 'Idem, só na resposta do /v1/search (cross-vertical).',
                  },
                  {
                    term: 'active_specialties[]',
                    meaning: 'Habilitações/soros agregados de todas as verticais, no /v1/search.',
                  },
                ]}
              />
            </div>

            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Procedência e confiança
            </h3>
            <div className="mb-5">
              <LegendTable
                rows={[
                  {
                    term: 'extraction_source',
                    meaning:
                      'Como o registro foi extraído: pdf_text (determinístico) · xlsx (planilha) · llm_gemini / llm_groq (vision-LLM) · pdf_ocr (Tesseract).',
                  },
                  {
                    term: 'requires_verification',
                    meaning:
                      'true quando o dado veio de OCR ou de LLM com baixa confiança — confirme antes de usar. Calculado no banco.',
                  },
                  {
                    term: 'status (estados)',
                    meaning:
                      'ok · ok_ocr (extraído com aviso) · unsupported (formato não suportado) · error · pending.',
                  },
                ]}
              />
            </div>

            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Geolocalização
            </h3>
            <LegendTable
              rows={[
                {
                  term: 'geocoding_status',
                  meaning: 'ok (tem lat/lng) · pending (na fila) · failed (não resolvido).',
                },
                {
                  term: 'geocoding_source',
                  meaning:
                    'Origem das coordenadas: cnes_api (registro oficial CNES) · nominatim · brasilapi.',
                },
                {
                  term: 'distance_m / distance_km',
                  meaning:
                    'Distância da origem até o hospital (somente em /hospitals/nearby por CEP/coordenadas).',
                },
              ]}
            />
          </section>

          {/* Exemplos de integração */}
          <section id="exemplos" className="scroll-mt-24">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Exemplos de integração</h2>
            <div className="space-y-4">
              <CodeBlock lang="js">{`const res = await fetch(
  '${BASE}/v1/oncology/hospitals/nearby?cep=01310100&disease=radiotherapy'
);
const { hospitals } = await res.json();
console.log(hospitals[0].name, hospitals[0].distance_km + ' km');`}</CodeBlock>
              <CodeBlock lang="python">{`import requests

r = requests.get(
    '${BASE}/v1/rare-diseases/hospitals',
    params={'state_code': 'SP', 'disease': 'gene_therapy'}
)
for h in r.json()['hospitals']:
    print(h['city'], '-', h['name'])`}</CodeBlock>
              <CodeBlock lang="bash">{`curl "${BASE}/v1/search?city=Curitiba" | python3 -m json.tool`}</CodeBlock>
            </div>

            <div className="mt-8 p-5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-500 shadow-sm">
              <p>
                <strong className="text-slate-700">Código-fonte:</strong>{' '}
                <a
                  href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline"
                >
                  github.com/Codar-Sistemas/hospitais-referencia-api
                </a>
              </p>
              <p className="mt-1 text-slate-400 text-xs">
                Dados: Ministério da Saúde · Atualização automática diária · Sem garantias de
                completude.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
