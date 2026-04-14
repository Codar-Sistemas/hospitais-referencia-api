# hospitais-referencia-api

API pública e gratuita com os **hospitais de referência para acidentes
por animais peçonhentos no Brasil**, extraídos dos PDFs oficiais do
Ministério da Saúde (`gov.br/saude`).

- Atualização automática diária (GitHub Actions detecta mudanças nos PDFs)
- Dados normalizados: filtros por UF, município, tipo de atendimento
- CORS liberado, cache no edge, sem autenticação
- Custo: **R$ 0** no plano gratuito de Supabase + Vercel + GitHub Actions

## Fonte dos dados

Ministério da Saúde — Lista oficial de hospitais com soros antiofídicos
e antiveneno, organizada por estado:
<https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia>

Cada estado publica um PDF com a data "Atualizado em DD/MM/AAAA HHhMM"
(horário de Brasília). O sistema compara essa data (e o SHA256 do PDF)
com o último sync para decidir se precisa reprocessar.

### Variações de formato observadas entre estados

Durante o desenvolvimento identificamos algumas variações na publicação
oficial que o sync trata:

- **URL do arquivo**: a maioria dos estados publica como `.pdf` direto no
  href, mas alguns (ex: MG) usam o padrão Plone `/@@download/file`. O
  scraper detecta ambos.
- **Pernambuco publica XLSX** em vez de PDF. Não é suportado ainda — o
  sync marca `status='nao_suportado'` nessa UF e segue. Adicionar suporte
  a XLSX fica como TODO (extensão pontual).
- **Variante de atendimento "Botrópico-Crotálico"** (observada em MG,
  hospital de Uberaba): tratada como composto, expande para os dois
  tipos individuais mantendo o texto original em `atendimentos_raw`.
- **Layouts ligeiramente diferentes**: o número de colunas internas do
  PDF varia entre estados. O parser usa as linhas verticais desenhadas
  no PDF (não posições fixas) como fronteiras, o que se adapta a essa
  variação.

## Arquitetura

```
 ┌─────────────────────┐     ┌──────────────┐     ┌──────────┐
 │  GitHub Actions     │────▶│   Supabase   │◀────│  Vercel  │◀── usuários
 │  cron diário 06UTC  │     │  (Postgres)  │     │ (serverless)│
 │  scripts/sync.py    │     │              │     │  api/index.js│
 └─────────────────────┘     └──────────────┘     └──────────┘
         │
         ▼
  gov.br/saude (PDFs oficiais)
```

- **Sync (Python)**: baixa páginas, detecta mudanças, parseia PDFs com
  `pdfplumber` (word-level coordinates — robusto a células mescladas)
  e faz upsert no Supabase.
- **Supabase**: Postgres gerenciado com RLS. A tabela `hospitais` tem
  índice GIN em `atendimentos[]` e full-text em `unidade+endereço`.
- **API (Node.js na Vercel)**: proxy leve sobre o PostgREST do Supabase,
  com normalização de parâmetros, validação e cache HTTP.

## Endpoints

Base: `https://SEU-DOMINIO.vercel.app`

### Consulta de metadados
| Endpoint | Descrição |
|---|---|
| `GET /v1/estados` | Lista as 27 UFs com data de atualização e total de hospitais |
| `GET /v1/estados/:uf` | Detalhes de uma UF |

### Busca de hospitais
| Endpoint | Descrição |
|---|---|
| `GET /v1/hospitais?uf=SP` | Lista hospitais de SP |
| `GET /v1/hospitais?uf=SP&atendimento=crotalico` | Filtra por tipo de soro |
| `GET /v1/hospitais?municipio=Campinas` | Filtra por município |
| `GET /v1/hospitais?q=santa+casa&uf=SP` | Full-text em unidade/endereço |
| `GET /v1/hospitais/:id` | Hospital por ID |

### Busca por proximidade (NOVO)
| Endpoint | Descrição |
|---|---|
| `GET /v1/hospitais/proximos?cep=13280000&raio=50000` | Por CEP, raio em metros (default 50km, máx 200km) |
| `GET /v1/hospitais/proximos?lat=-23.5&lng=-46.6` | Por coordenadas diretas |
| `GET /v1/hospitais/proximos?cidade=Campinas&uf=SP` | Por nome de cidade (fallback sem distância) |

Filtros combináveis: `&atendimento=crotalico&limit=20&uf=SP`.

Tipos de atendimento aceitos (case/accent-insensitive):
`botropico`, `crotalico`, `elapidico`, `laquetico`, `escorpionico`,
`loxoscelico`, `foneutrico`, `lonomico`.

### Exemplos

**1. Hospital mais próximo com soro antilaquético, dado um CEP:**
```bash
curl "https://SEU-DOMINIO.vercel.app/v1/hospitais/proximos?cep=18618970&atendimento=laquetico&limit=5"
```

```json
{
  "origem": {
    "lat": -22.889,
    "lng": -48.445,
    "fonte": "cep",
    "cep": { "cep": "18618970", "cidade": "Botucatu", "uf": "SP", ... }
  },
  "raio_m": 50000,
  "total_retornados": 1,
  "hospitais": [
    {
      "id": 42,
      "municipio": "Botucatu",
      "unidade": "Hospital da Clínicas da Faculdade de Medicina de Botucatu",
      "endereco": "Avenida Prof. Mario Rubens Guimarães Montenegro, s/n - UNESP Botucatu",
      "telefones": "(14) 3811-6129",
      "atendimentos": ["Botrópico","Crotálico","Elapídico","Laquético", ...],
      "lat": -22.894, "lng": -48.443,
      "distancia_m": 612.4,
      "distancia_km": 0.6
    }
  ]
}
```

**2. Hospitais com soro botrópico até 100 km das coordenadas do usuário:**
```bash
curl "https://SEU-DOMINIO.vercel.app/v1/hospitais/proximos?lat=-23.55&lng=-46.63&raio=100000&atendimento=botropico"
```

**3. Fallback por cidade quando não há coordenadas:**
```bash
curl "https://SEU-DOMINIO.vercel.app/v1/hospitais/proximos?cidade=Campinas&uf=SP"
```

## Setup

### Rodando 100% localmente (sem Supabase / sem Vercel)

Para desenvolvimento ou uso offline, o projeto inclui um `docker-compose.yml`
que sobe a stack inteira em containers:

- **Postgres 16** com extensões `cube`/`earthdistance` habilitadas
- **PostgREST** — mesma engine REST que o Supabase usa por baixo
- **API Node** — o mesmo `api/index.js` que roda na Vercel

```bash
docker compose up -d

# verifica:
curl http://localhost:3000/v1/estados       # API Node (handler Vercel)
curl http://localhost:3001/estados          # PostgREST cru (admin/debug)
```

Para popular o banco local rodando os scripts Python:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.local.example .env.local
export $(cat .env.local | xargs)

python -m scripts.sync SP            # sync de um estado
python -m scripts.sync geocode SP    # geocoding
```

Detalhes:
- O `docker-compose.yml` aplica as 3 migrations (`001_schema.sql`,
  `002_geocoding.sql`, `local_999_roles.sql`) automaticamente na primeira
  inicialização via `/docker-entrypoint-initdb.d`.
- `local_999_roles.sql` cria as roles `anon`, `authenticated`,
  `service_role` e `authenticator` que no Supabase gerenciado já existem
  nativamente.
- Os tokens JWT do `.env.local.example` são pré-assinados com o segredo
  de dev. Para gerar outros (por exemplo se mudar `PGRST_JWT_SECRET`),
  use `python scripts/local_jwt.py <role>`.
- Para começar do zero: `docker compose down -v` apaga o volume Postgres.

### Deploy em produção (Supabase + Vercel)

#### 1. Supabase

1. Crie um projeto em <https://supabase.com> (plano Free).
2. No SQL Editor, execute os dois scripts em ordem:
   - `sql/001_schema.sql` — tabelas, seed dos 27 estados, RLS
   - `sql/002_geocoding.sql` — extensões `earthdistance`, coordenadas, RPC de proximidade
3. Em *Project Settings → API*, copie:
   - `Project URL` → `SUPABASE_URL`
   - `anon` public key → `SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_KEY`

### 2. Primeira sincronização (local)

```bash
git clone SEU_REPO hospitais-referencia-api
cd hospitais-referencia-api

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# preencha SUPABASE_URL e SUPABASE_SERVICE_KEY

export $(cat .env | xargs)

# 1) sincroniza os PDFs para o banco (rápido: ~5 min)
python -m scripts.sync SP            # testa com um estado primeiro
python -m scripts.sync               # todos os estados

# 2) geocodifica hospitais pendentes (lento: ~1s por hospital)
python -m scripts.sync geocode SP
python -m scripts.sync geocode       # todos
```

### 3. Deploy da API na Vercel

```bash
npm i -g vercel
vercel                          # faz login e linka o projeto
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel --prod                   # publica
```

### 4. Cron automático (GitHub Actions)

No seu repositório, vá em *Settings → Secrets and variables → Actions*
e adicione:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

O workflow em `.github/workflows/sync.yml` roda diariamente às 06:00 UTC.
Você também pode disparar manualmente em *Actions → sync-hospitais → Run workflow*.

## Custos e limites do free tier

| Serviço | Limite | Uso estimado |
|---|---|---|
| Supabase (Postgres) | 500 MB DB, 5 GB egress/mês | ~3 MB DB, minúsculo egress |
| Vercel (Hobby) | 100 GB bandwidth/mês, 100k invocations/dia | conforme tráfego |
| GitHub Actions | 2.000 min/mês (repo público: ilimitado) | ~5 min/dia |

Tudo cabe com folga. O único gotcha do Supabase Free: projetos pausam
após 1 semana inativos — como rodamos sync diário, nunca pausa.

## Estrutura do projeto

```
hospitais-referencia-api/
├── api/
│   └── index.js              # API Vercel (Node) — todos os endpoints
├── scripts/
│   ├── __init__.py
│   ├── parser.py             # extração de PDF (pdfplumber + word coords)
│   ├── geocode.py            # Nominatim + BrasilAPI com rate limit + cache
│   └── sync.py               # scraper gov.br + upsert Supabase + geocoding
├── sql/
│   ├── 001_schema.sql        # tabelas, RLS, seed dos 27 estados
│   └── 002_geocoding.sql     # earthdistance, lat/lng, RPC hospitais_proximos
├── tests/
│   ├── test_parser.py        # smoke test do parser contra PDF real
│   ├── test_atendimentos.py  # casos unitários de normalize_atendimentos
│   └── test_geocode.py       # limpeza de endereço, cache, CEP inválido
├── .github/workflows/
│   └── sync.yml              # cron diário com 2 jobs: sync + geocode
├── package.json
├── requirements.txt
├── vercel.json
├── .env.example
└── README.md
```

## Sobre integração com BrasilAPI

Este projeto foi desenhado para ser **compatível em filosofia** com a
BrasilAPI (<https://brasilapi.com.br>) — agrega e normaliza dados
públicos governamentais brasileiros. Depois de rodar por alguns meses e
comprovar estabilidade, faz sentido propor a inclusão como um endpoint
oficial da BrasilAPI via PR em <https://github.com/BrasilAPI/BrasilAPI>.

## Licença e disclaimer

Os dados pertencem ao Ministério da Saúde do Brasil. Este projeto apenas
redistribui em formato estruturado.

**Esta API é uma ferramenta de referência. Em caso de acidente com
animal peçonhento, ligue para o SAMU (192) e procure o hospital mais
próximo — as informações aqui podem estar desatualizadas em relação à
realidade no momento do atendimento.**
