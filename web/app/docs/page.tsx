const BASE = 'https://hospitais-referencia-api.vercel.app';

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-green-300 rounded-lg p-4 text-sm overflow-x-auto leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path, desc, params, example, response }: {
  method: string; path: string; desc: string;
  params?: { nome: string; tipo: string; desc: string; obrigatorio?: boolean }[];
  example: string; response: string;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
      <div className="bg-gray-50 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <span className="bg-green-700 text-white text-xs font-bold px-2 py-0.5 rounded">{method}</span>
        <code className="text-sm font-mono text-gray-800">{path}</code>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-gray-600 text-sm">{desc}</p>
        {params && params.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Parâmetros</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="pb-1 pr-4">Nome</th>
                  <th className="pb-1 pr-4">Tipo</th>
                  <th className="pb-1">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {params.map((p) => (
                  <tr key={p.nome}>
                    <td className="py-1.5 pr-4 font-mono text-xs text-blue-700">
                      {p.nome}{p.obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-500 text-xs">{p.tipo}</td>
                    <td className="py-1.5 text-gray-600 text-xs">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Exemplo</h4>
          <Code>{example}</Code>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resposta</h4>
          <Code>{response}</Code>
        </div>
      </div>
    </div>
  );
}

export default function Docs() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Documentação da API</h1>
        <p className="mt-2 text-gray-500">
          API pública e gratuita. Sem autenticação. CORS liberado.
        </p>
        <div className="mt-4 bg-gray-900 text-green-300 rounded-lg px-4 py-3 font-mono text-sm">
          Base URL: <span className="text-white">{BASE}</span>
        </div>
      </div>

      {/* Tipos de atendimento */}
      <div className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-semibold text-amber-900 mb-2">Tipos de atendimento aceitos</h3>
        <p className="text-sm text-amber-700 mb-3">
          O parâmetro <code className="bg-amber-100 px-1 rounded">atendimento</code> aceita o nome técnico ou o nome popular do animal (sem acento, case-insensitive):
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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
            <div key={tecnico} className="bg-white rounded-lg p-2 border border-amber-100">
              <div className="font-mono font-bold text-gray-800">{tecnico}</div>
              <div className="text-gray-500 mt-0.5">{popular}</div>
            </div>
          ))}
        </div>
      </div>

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
    },
    ...
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
  "pagina_url": "https://www.gov.br/saude/.../sao-paulo",
  "pdf_url": "https://www.gov.br/saude/.../sao-paulo",
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
          { nome: 'uf', tipo: 'string', desc: 'Sigla do estado (ex: SP, RJ)', obrigatorio: false },
          { nome: 'municipio', tipo: 'string', desc: 'Nome da cidade (busca parcial)', obrigatorio: false },
          { nome: 'cidade', tipo: 'string', desc: 'Alias de municipio', obrigatorio: false },
          { nome: 'atendimento', tipo: 'string', desc: 'Tipo de soro ou nome do animal', obrigatorio: false },
          { nome: 'q', tipo: 'string', desc: 'Full-text em unidade + endereço', obrigatorio: false },
          { nome: 'limit', tipo: 'number', desc: 'Máximo de resultados (padrão 100, máx 500)', obrigatorio: false },
          { nome: 'offset', tipo: 'number', desc: 'Paginação', obrigatorio: false },
        ]}
        example={`# Por estado e tipo de animal
curl "${BASE}/v1/hospitais?uf=SP&atendimento=escorpiao"

# Por cidade
curl "${BASE}/v1/hospitais?cidade=Campinas&uf=SP"

# Full-text
curl "${BASE}/v1/hospitais?q=santa+casa&uf=SP"`}
        response={`{
  "filtros": { "uf": "SP", "municipio": null, "atendimento": "escorpiao", ... },
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
      "atendimentos": ["Botrópico", "Crotálico", "Escorpiônico", ...]
    },
    ...
  ]
}`}
      />

      <Endpoint
        method="GET" path="/v1/hospitais/proximos"
        desc="Busca hospitais ordenados por distância. Aceita CEP, coordenadas lat/lng ou cidade como origem."
        params={[
          { nome: 'cep', tipo: 'string', desc: 'CEP de 8 dígitos (resolve lat/lng via BrasilAPI)', obrigatorio: false },
          { nome: 'lat', tipo: 'number', desc: 'Latitude decimal', obrigatorio: false },
          { nome: 'lng', tipo: 'number', desc: 'Longitude decimal', obrigatorio: false },
          { nome: 'cidade', tipo: 'string', desc: 'Nome da cidade (fallback sem distância)', obrigatorio: false },
          { nome: 'raio', tipo: 'number', desc: 'Raio em metros (padrão 50000, máx 200000)', obrigatorio: false },
          { nome: 'atendimento', tipo: 'string', desc: 'Filtro por tipo de soro', obrigatorio: false },
          { nome: 'limit', tipo: 'number', desc: 'Máximo de resultados (padrão 20, máx 100)', obrigatorio: false },
        ]}
        example={`# Por CEP (mais preciso)
curl "${BASE}/v1/hospitais/proximos?cep=13280000&atendimento=crotalico"

# Por coordenadas
curl "${BASE}/v1/hospitais/proximos?lat=-23.5&lng=-46.6&raio=30000"

# Por cidade (sem distância)
curl "${BASE}/v1/hospitais/proximos?cidade=Campinas&uf=SP"`}
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
      "atendimentos": ["Botrópico", "Crotálico", ...],
      "lat": -22.894, "lng": -48.443,
      "distancia_m": 612.4,
      "distancia_km": 0.6
    }
  ]
}`}
      />

      <Endpoint
        method="GET" path="/v1/hospitais/:id"
        desc="Retorna todos os dados de um hospital específico, incluindo coordenadas e status de geocoding."
        example={`curl "${BASE}/v1/hospitais/42"`}
        response={`{
  "id": 42,
  "uf": "SP",
  "municipio": "Botucatu",
  "unidade": "Hospital das Clínicas da Faculdade de Medicina de Botucatu",
  "endereco": "Avenida Prof. Mario Rubens Guimarães Montenegro, s/n",
  "telefones": "(14) 3811-6129",
  "cnes": "2748223",
  "atendimentos": ["Botrópico", "Crotálico", "Elapídico", "Laquético", ...],
  "lat": -22.894, "lng": -48.443,
  "geocode_status": "ok",
  "geocode_fonte": "nominatim"
}`}
      />

      {/* Exemplos de código */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-4">Exemplos de integração</h2>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">JavaScript / TypeScript</h3>
          <Code>{`const res = await fetch(
  'https://hospitais-referencia-api.vercel.app/v1/hospitais/proximos?cep=01310100&atendimento=escorpiao'
);
const { hospitais } = await res.json();
console.log(hospitais[0].unidade, hospitais[0].distancia_km + ' km');`}</Code>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Python</h3>
          <Code>{`import requests

r = requests.get(
    'https://hospitais-referencia-api.vercel.app/v1/hospitais',
    params={'uf': 'SP', 'atendimento': 'escorpiao', 'limit': 50}
)
for h in r.json()['hospitais']:
    print(h['municipio'], '-', h['unidade'])`}</Code>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">cURL</h3>
          <Code>{`curl "https://hospitais-referencia-api.vercel.app/v1/hospitais/proximos?\\
  cep=13280000&atendimento=crotalico&limit=5" | python3 -m json.tool`}</Code>
        </div>
      </div>

      <div className="mt-10 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
        <strong>Código-fonte:</strong>{' '}
        <a href="https://github.com/Codar-Sistemas/hospitais-referencia-api" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
          github.com/Codar-Sistemas/hospitais-referencia-api
        </a>
        <br />
        <strong>Dados:</strong> Ministério da Saúde · Atualização automática diária · Sem garantias de completude.
      </div>
    </div>
  );
}
