const BASE = 'https://hospitais-referencia-api.vercel.app';

function Method({ m }: { m: string }) {
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
      {m}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed font-mono">
      <code>{children}</code>
    </pre>
  );
}

function ParamTable({ params }: { params: { nome: string; tipo: string; desc: string; obrigatorio?: boolean }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Parâmetro</th>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
            <th className="text-left px-4 py-2.5 font-semibold text-slate-500 uppercase tracking-wide">Descrição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {params.map((p) => (
            <tr key={p.nome}>
              <td className="px-4 py-2.5 font-mono text-emerald-700 font-medium">
                {p.nome}{p.obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
              </td>
              <td className="px-4 py-2.5 text-slate-500">{p.tipo}</td>
              <td className="px-4 py-2.5 text-slate-600">{p.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Endpoint({ method, path, desc, params, example, response }: {
  method: string; path: string; desc: string;
  params?: { nome: string; tipo: string; desc: string; obrigatorio?: boolean }[];
  example: string; response: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
        <Method m={method} />
        <code className="text-sm font-mono text-slate-800 font-semibold">{path}</code>
      </div>
      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
        {params && params.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parâmetros</h4>
            <ParamTable params={params} />
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Exemplo</h4>
          <Code>{example}</Code>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resposta</h4>
          <Code>{response}</Code>
        </div>
      </div>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Documentação da API</h1>
        </div>
        <p className="text-slate-500 text-sm mb-4">
          API pública e gratuita. Sem autenticação. CORS liberado.
        </p>
        <div className="bg-slate-900 text-slate-100 rounded-xl px-5 py-3 font-mono text-sm flex items-center gap-3">
          <span className="text-slate-400 text-xs uppercase tracking-wide">Base URL</span>
          <span className="text-emerald-400">{BASE}</span>
        </div>
      </div>

      {/* Animal types */}
      <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 className="font-semibold text-amber-900 mb-1 text-sm">Tipos de atendimento</h3>
        <p className="text-xs text-amber-700 mb-4">
          O parâmetro <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">atendimento</code> aceita o nome técnico ou popular do animal (sem acento, case-insensitive).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { tecnico: 'botropico',    popular: 'jararaca, cobra' },
            { tecnico: 'crotalico',    popular: 'cascavel' },
            { tecnico: 'elapidico',    popular: 'coral' },
            { tecnico: 'laquetico',    popular: 'surucucu' },
            { tecnico: 'escorpionico', popular: 'escorpiao' },
            { tecnico: 'loxoscelico',  popular: 'aranha marrom' },
            { tecnico: 'foneutrico',   popular: 'armadeira' },
            { tecnico: 'lonomico',     popular: 'lagarta' },
          ].map(({ tecnico, popular }) => (
            <div key={tecnico} className="bg-white rounded-xl p-3 border border-amber-100">
              <div className="font-mono font-bold text-slate-800 text-xs">{tecnico}</div>
              <div className="text-amber-700 text-xs mt-0.5">{popular}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <h2 className="text-lg font-bold text-slate-900 mb-4">Endpoints</h2>

      <Endpoint
        method="GET" path="/v1/estados"
        desc="Lista as 27 UFs com status de sincronização e total de hospitais cadastrados."
        example={`curl "${BASE}/v1/estados"`}
        response={`{
  "estados": [
    {
      "uf": "SP",
      "nome": "São Paulo",
      "atualizado_em": "2026-02-14T18:04:00Z",
      "sincronizado_em": "2026-04-14T03:00:00Z",
      "total_hospitais": 242
    }
  ]
}`}
      />

      <Endpoint
        method="GET" path="/v1/estados/:uf"
        desc="Detalhes de um estado específico, incluindo URL do PDF fonte e hash SHA256."
        example={`curl "${BASE}/v1/estados/SP"`}
        response={`{
  "uf": "SP",
  "nome": "São Paulo",
  "pdf_url": "https://www.gov.br/saude/...",
  "atualizado_em": null,
  "sincronizado_em": "2026-04-14T03:00:00Z",
  "total_hospitais": 242,
  "status": "ok"
}`}
      />

      <Endpoint
        method="GET" path="/v1/hospitais"
        desc="Busca hospitais com filtros combinados. Requer ao menos uf, municipio/cidade ou q."
        params={[
          { nome: 'uf',          tipo: 'string', desc: 'Sigla do estado (ex: SP, RJ)' },
          { nome: 'municipio',   tipo: 'string', desc: 'Nome da cidade (busca parcial)' },
          { nome: 'cidade',      tipo: 'string', desc: 'Alias de municipio' },
          { nome: 'atendimento', tipo: 'string', desc: 'Tipo de soro ou nome do animal' },
          { nome: 'q',           tipo: 'string', desc: 'Full-text em unidade + endereço' },
          { nome: 'limit',       tipo: 'number', desc: 'Máximo de resultados (padrão 100, máx 500)' },
          { nome: 'offset',      tipo: 'number', desc: 'Paginação' },
        ]}
        example={`# Por estado e animal
curl "${BASE}/v1/hospitais?uf=SP&atendimento=escorpiao"

# Por cidade
curl "${BASE}/v1/hospitais?cidade=Campinas&uf=SP"

# Full-text
curl "${BASE}/v1/hospitais?q=santa+casa&uf=SP"`}
        response={`{
  "filtros": { "uf": "SP", "municipio": null, "atendimento": "escorpiao" },
  "total_retornados": 87,
  "hospitais": [
    {
      "id": 1,
      "uf": "SP",
      "municipio": "Adamantina",
      "unidade": "Santa Casa de Misericórdia",
      "endereco": "Rua Joaquim Luiz Viana, 209",
      "telefones": "(18) 3502-2200",
      "cnes": "2077647",
      "atendimentos": ["Botrópico", "Crotálico", "Escorpiônico"]
    }
  ]
}`}
      />

      <Endpoint
        method="GET" path="/v1/hospitais/proximos"
        desc="Hospitais ordenados por distância. Aceita CEP, coordenadas lat/lng ou cidade como origem."
        params={[
          { nome: 'cep',         tipo: 'string', desc: 'CEP de 8 dígitos (resolve lat/lng via BrasilAPI)' },
          { nome: 'lat',         tipo: 'number', desc: 'Latitude decimal' },
          { nome: 'lng',         tipo: 'number', desc: 'Longitude decimal' },
          { nome: 'cidade',      tipo: 'string', desc: 'Nome da cidade (fallback sem distância)' },
          { nome: 'raio',        tipo: 'number', desc: 'Raio em metros (padrão 50000, máx 200000)' },
          { nome: 'atendimento', tipo: 'string', desc: 'Filtro por tipo de soro' },
          { nome: 'limit',       tipo: 'number', desc: 'Máximo de resultados (padrão 20, máx 100)' },
        ]}
        example={`# Por CEP
curl "${BASE}/v1/hospitais/proximos?cep=13280000&atendimento=crotalico"

# Por coordenadas
curl "${BASE}/v1/hospitais/proximos?lat=-23.5&lng=-46.6&raio=30000"`}
        response={`{
  "origem": {
    "lat": -22.889, "lng": -48.445,
    "fonte": "cep",
    "cep": { "cep": "13280000", "cidade": "Vinhedo", "uf": "SP" }
  },
  "raio_m": 50000,
  "total_retornados": 3,
  "hospitais": [
    {
      "id": 42,
      "municipio": "Botucatu",
      "unidade": "Hospital das Clínicas - UNESP",
      "atendimentos": ["Botrópico", "Crotálico"],
      "lat": -22.894, "lng": -48.443,
      "distancia_m": 612.4,
      "distancia_km": 0.6
    }
  ]
}`}
      />

      <Endpoint
        method="GET" path="/v1/hospitais/:id"
        desc="Todos os dados de um hospital específico, incluindo coordenadas e status de geocoding."
        example={`curl "${BASE}/v1/hospitais/42"`}
        response={`{
  "id": 42,
  "uf": "SP",
  "municipio": "Botucatu",
  "unidade": "Hospital das Clínicas da Faculdade de Medicina de Botucatu",
  "endereco": "Avenida Prof. Mario Rubens Guimarães Montenegro, s/n",
  "telefones": "(14) 3811-6129",
  "cnes": "2748223",
  "atendimentos": ["Botrópico", "Crotálico", "Elapídico", "Laquético"],
  "lat": -22.894, "lng": -48.443,
  "geocode_status": "ok",
  "geocode_fonte": "nominatim"
}`}
      />

      {/* Code examples */}
      <h2 className="text-lg font-bold text-slate-900 mt-10 mb-4">Exemplos de integração</h2>
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">JavaScript / TypeScript</h3>
          <Code>{`const res = await fetch(
  '${BASE}/v1/hospitais/proximos?cep=01310100&atendimento=escorpiao'
);
const { hospitais } = await res.json();
console.log(hospitais[0].unidade, hospitais[0].distancia_km + ' km');`}</Code>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Python</h3>
          <Code>{`import requests

r = requests.get(
    '${BASE}/v1/hospitais',
    params={'uf': 'SP', 'atendimento': 'escorpiao', 'limit': 50}
)
for h in r.json()['hospitais']:
    print(h['municipio'], '-', h['unidade'])`}</Code>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">cURL</h3>
          <Code>{`curl "${BASE}/v1/hospitais/proximos?cep=13280000&atendimento=crotalico&limit=5" \\
  | python3 -m json.tool`}</Code>
        </div>
      </div>

      <div className="mt-8 p-5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-500 shadow-sm">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
          <div>
            <p>
              <strong className="text-slate-700">Código-fonte:</strong>{' '}
              <a href="https://github.com/Codar-Sistemas/hospitais-referencia-api" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                github.com/Codar-Sistemas/hospitais-referencia-api
              </a>
            </p>
            <p className="mt-1 text-slate-400 text-xs">
              Dados: Ministério da Saúde · Atualização automática diária · Sem garantias de completude.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
