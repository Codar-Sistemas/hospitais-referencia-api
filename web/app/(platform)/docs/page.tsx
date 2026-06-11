import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Docs',
  description:
    'Documentação da API REST pública e gratuita do MapaSUS para consulta dos estabelecimentos de referência habilitados pelo SUS.',
};

const BASE = 'https://hospitais-referencia-api.vercel.app';

function Method({ method }: { method: string }) {
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
      {method}
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
              <td className="px-4 py-2.5 font-mono text-emerald-700 font-medium">
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

interface EndpointProps {
  method: string;
  path: string;
  description: string;
  params?: ParamDef[];
  example: string;
  response: string;
}

function Endpoint({ method, path, description, params, example, response }: EndpointProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
        <Method method={method} />
        <code className="text-sm font-mono text-slate-800 font-semibold">{path}</code>
      </div>
      <div className="p-5 space-y-4">
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
            Exemplo
          </h4>
          <Code>{example}</Code>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Resposta
          </h4>
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
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Documentação da API</h1>
        </div>
        <p className="text-slate-500 text-sm mb-4">
          API pública e gratuita. Sem autenticação. CORS liberado.
        </p>
        <div className="bg-slate-900 text-slate-100 rounded-xl px-5 py-3 font-mono text-sm flex items-center gap-3 mb-3">
          <span className="text-slate-400 text-xs uppercase tracking-wide">Base URL</span>
          <span className="text-emerald-400">{BASE}</span>
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
      </div>

      {/* Fair use notice */}
      <div className="mb-8 bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-blue-900 text-sm mb-1">Use com responsabilidade</h3>
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
        </div>
      </div>

      {/* Treatment types */}
      <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <h3 className="font-semibold text-amber-900 mb-1 text-sm">Tipos de atendimento</h3>
        <p className="text-xs text-amber-700 mb-4">
          O parâmetro{' '}
          <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">treatment</code> aceita o
          nome canônico em inglês ou aliases populares (sem acento, case-insensitive).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { canonical: 'Bothropic', aliases: 'jararaca, cobra' },
            { canonical: 'Crotalic', aliases: 'cascavel' },
            { canonical: 'Elapidic', aliases: 'coral' },
            { canonical: 'Lachetic', aliases: 'surucucu' },
            { canonical: 'Scorpionic', aliases: 'escorpiao' },
            { canonical: 'Loxoscelic', aliases: 'aranha marrom' },
            { canonical: 'Phoneutric', aliases: 'armadeira' },
            { canonical: 'Lonomic', aliases: 'lagarta, lonomia' },
          ].map(({ canonical, aliases }) => (
            <div key={canonical} className="bg-white rounded-xl p-3 border border-amber-100">
              <div className="font-mono font-bold text-slate-800 text-xs">{canonical}</div>
              <div className="text-amber-700 text-xs mt-0.5">{aliases}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <h2 className="text-lg font-bold text-slate-900 mb-4">Endpoints</h2>

      <Endpoint
        method="GET"
        path="/v1/states"
        description="Lista as 27 UFs com status de sincronização e total de hospitais cadastrados."
        example={`curl "${BASE}/v1/states"`}
        response={`{
  "states": [
    {
      "state_code": "SP",
      "name": "São Paulo",
      "updated_at": "2026-02-14T18:04:00Z",
      "synced_at": "2026-04-14T03:00:00Z",
      "total_hospitals": 242
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/v1/states/:state_code"
        description="Detalhes de um estado específico, incluindo URL do PDF fonte e hash SHA256."
        example={`curl "${BASE}/v1/states/SP"`}
        response={`{
  "state_code": "SP",
  "name": "São Paulo",
  "pdf_url": "https://www.gov.br/saude/...",
  "updated_at": null,
  "synced_at": "2026-04-14T03:00:00Z",
  "total_hospitals": 242,
  "status": "ok"
}`}
      />

      <Endpoint
        method="GET"
        path="/v1/hospitals"
        description="Busca hospitais com filtros combinados. Requer ao menos state_code, city ou q."
        params={[
          { name: 'state_code', type: 'string', description: 'Sigla do estado (ex: SP, RJ)' },
          { name: 'city', type: 'string', description: 'Nome da cidade (busca parcial)' },
          {
            name: 'treatment',
            type: 'string',
            description: 'Tipo de soro (canônico em inglês ou alias popular)',
          },
          { name: 'q', type: 'string', description: 'Full-text em name + address' },
          {
            name: 'limit',
            type: 'number',
            description: 'Máximo de resultados (padrão 100, máx 500)',
          },
          { name: 'offset', type: 'number', description: 'Paginação' },
        ]}
        example={`# Por estado e animal
curl "${BASE}/v1/hospitals?state_code=SP&treatment=escorpiao"

# Por cidade
curl "${BASE}/v1/hospitals?city=Campinas&state_code=SP"

# Full-text
curl "${BASE}/v1/hospitals?q=santa+casa&state_code=SP"`}
        response={`{
  "filters": { "state_code": "SP", "city": null, "treatment": "Scorpionic" },
  "total_returned": 87,
  "hospitals": [
    {
      "id": 1,
      "state_code": "SP",
      "city": "Adamantina",
      "name": "Santa Casa de Misericórdia",
      "address": "Rua Joaquim Luiz Viana, 209",
      "phones": "(18) 3502-2200",
      "cnes": "2077647",
      "treatments": ["Bothropic", "Crotalic", "Scorpionic"]
    }
  ]
}`}
      />

      <Endpoint
        method="GET"
        path="/v1/hospitals/nearby"
        description="Hospitais ordenados por distância. Aceita CEP, coordenadas lat/lng ou cidade como origem."
        params={[
          {
            name: 'cep',
            type: 'string',
            description: 'CEP de 8 dígitos (resolve lat/lng via BrasilAPI)',
          },
          { name: 'lat', type: 'number', description: 'Latitude decimal' },
          { name: 'lng', type: 'number', description: 'Longitude decimal' },
          { name: 'city', type: 'string', description: 'Nome da cidade (fallback sem distância)' },
          { name: 'state_code', type: 'string', description: 'Restrição opcional por estado' },
          {
            name: 'radius_m',
            type: 'number',
            description: 'Raio em metros (padrão 50000, máx 200000)',
          },
          { name: 'treatment', type: 'string', description: 'Filtro por tipo de soro' },
          {
            name: 'limit',
            type: 'number',
            description: 'Máximo de resultados (padrão 20, máx 100)',
          },
        ]}
        example={`# Por CEP
curl "${BASE}/v1/hospitals/nearby?cep=13280000&treatment=crotalico"

# Por coordenadas
curl "${BASE}/v1/hospitals/nearby?lat=-23.5&lng=-46.6&radius_m=30000"`}
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
        method="GET"
        path="/v1/hospitals/:id"
        description="Todos os dados de um hospital específico, incluindo coordenadas e status de geocoding."
        example={`curl "${BASE}/v1/hospitals/42"`}
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
  "geocoding_source": "nominatim"
}`}
      />

      {/* Code examples */}
      <h2 className="text-lg font-bold text-slate-900 mt-10 mb-4">Exemplos de integração</h2>
      <div className="space-y-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            JavaScript / TypeScript
          </h3>
          <Code>{`const res = await fetch(
  '${BASE}/v1/hospitals/nearby?cep=01310100&treatment=scorpion'
);
const { hospitals } = await res.json();
console.log(hospitals[0].name, hospitals[0].distance_km + ' km');`}</Code>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Python
          </h3>
          <Code>{`import requests

r = requests.get(
    '${BASE}/v1/hospitals',
    params={'state_code': 'SP', 'treatment': 'scorpion', 'limit': 50}
)
for h in r.json()['hospitals']:
    print(h['city'], '-', h['name'])`}</Code>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            cURL
          </h3>
          <Code>{`curl "${BASE}/v1/hospitals/nearby?cep=13280000&treatment=crotalico&limit=5" \\
  | python3 -m json.tool`}</Code>
        </div>
      </div>

      <div className="mt-8 p-5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-500 shadow-sm">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-slate-400 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
          <div>
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
        </div>
      </div>
    </div>
  );
}
