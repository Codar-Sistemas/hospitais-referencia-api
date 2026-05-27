# MapaSUS — Plano de Migração para Plataforma

> **Status:** Planning · **Autor:** Felipe França (Codar Sistemas) · **Data:** 2026-05
> **Predecessores:** `REFACTORING_MAP.md` (Phase 0), Phase 1 (Métricas/Telemetria)
> **Objetivo:** transformar o projeto `hospitais-referencia-api` numa **plataforma multi-vertical** de transparência sobre estabelecimentos habilitados pelo SUS, sob a marca **MapaSUS**.

---

## 1. Por que migrar

| Hoje                                           | Depois                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1 projeto: peçonhentos                         | 1 plataforma: N verticais                                                                         |
| Marca: "Hospitais de Referência"               | Marca: **MapaSUS**                                                                                |
| Domínio: `hospitais-referencia-web.vercel.app` | `peconhentos.mapasus.com.br`, `raras.mapasus...`, `oncologia.mapasus...`, hub em `mapasus.com.br` |
| Narrativa NIW: "fiz um site"                   | Narrativa NIW: **"construí a infraestrutura que o MS deveria ter construído"**                    |

## 2. Princípios

1. **Zero downtime.** O site atual continua funcionando o tempo todo.
2. **Monorepo, código compartilhado.** Sem duplicar lógica de sync/geocoding/parser.
3. **Banco unificado** com discriminador `vertical`, não tabelas separadas por domínio.
4. **Hospital é único.** Um mesmo CNES pode aparecer em múltiplas verticais (oncologia + peçonhentos).
5. **API namespaced** sob `/v1/{vertical}/*` + endpoint cross-vertical `/v1/search`.
6. **Cada vertical é deployable independente** (rota / subdomínio próprios), mas compartilha o build.
7. **Disclaimer "iniciativa independente"** em todas as páginas (mitiga risco com MS).

## 3. Arquitetura-alvo

```
mapasus-platform/                  ← repo renomeado (hoje: hospitais-referencia-api)
├── README.md
├── MAPASUS_MIGRATION.md           ← este arquivo
├── lib/                           ← compartilhado (já existe)
│   ├── providers/                 ← brasil-api, nominatim, ibge
│   ├── services/                  ← geocoding, sync engine, parser core
│   ├── repositories/              ← supabase access
│   └── core/                      ← http, logger, errors
├── api/
│   └── index.js                   ← uma função Vercel, roteia por path
├── scripts/
│   ├── peconhentos/               ← sync atual
│   ├── raras/                     ← novo
│   └── oncologia/                 ← novo
├── sql/                           ← migrations
│   ├── 009_multi_vertical.sql     ← discriminador + specialty table
│   ├── 010_raras_seed.sql
│   └── 011_oncologia_seed.sql
├── web/                           ← Next.js 16 multi-tenant
│   ├── middleware.ts              ← roteia por host
│   ├── app/
│   │   ├── (hub)/                 ← mapasus.com.br
│   │   ├── (peconhentos)/         ← peconhentos.mapasus.com.br
│   │   ├── (raras)/               ← raras.mapasus.com.br
│   │   └── (oncologia)/           ← oncologia.mapasus.com.br
│   ├── components/
│   │   ├── shared/                ← Navbar, Combobox, Map, FAQ — uso comum
│   │   └── verticals/             ← componentes específicos por vertical
│   └── lib/
└── tests/
```

## 4. Modelo de dados (sql/009)

```sql
-- Adiciona discriminador na tabela hospitals
ALTER TABLE hospitals
  ADD COLUMN verticals TEXT[] DEFAULT ARRAY['peconhentos'];

CREATE INDEX hospitals_verticals_gin ON hospitals USING gin(verticals);

-- Nova tabela: especialidades por vertical
CREATE TABLE hospital_specialties (
  hospital_id    UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  vertical       TEXT NOT NULL,             -- 'peconhentos' | 'raras' | 'oncologia'
  specialty      TEXT NOT NULL,             -- 'soro_bothropic' | 'radioterapia' | 'terapia_genica'
  habilitado_em  DATE,
  portaria       TEXT,                       -- referência normativa
  fonte_url      TEXT NOT NULL,              -- de onde extraímos
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (hospital_id, vertical, specialty)
);

CREATE INDEX hospital_specialties_vertical ON hospital_specialties(vertical);

-- View consolidada para search cross-vertical
CREATE OR REPLACE VIEW v_hospitals_all AS
SELECT h.*, array_agg(DISTINCT hs.vertical) AS active_verticals
FROM hospitals h
LEFT JOIN hospital_specialties hs ON hs.hospital_id = h.id
GROUP BY h.id;

-- Backfill: marca todos os hospitais existentes como vertical 'peconhentos'
-- (a tabela treatments atual vira a primeira leva de hospital_specialties)
INSERT INTO hospital_specialties (hospital_id, vertical, specialty, fonte_url)
SELECT t.hospital_id, 'peconhentos', t.treatment, h.source_url
FROM treatments t
JOIN hospitals h ON h.id = t.hospital_id
ON CONFLICT DO NOTHING;
```

**Rollback:** `DROP TABLE hospital_specialties; ALTER TABLE hospitals DROP COLUMN verticals;` — não destrutivo, dados antigos intactos em `treatments`.

## 5. Fases

### Phase 2.0 — Operacional (você, fora do código) · ~1 dia

| Passo | Ação                                                                          | Custo            |
| ----- | ----------------------------------------------------------------------------- | ---------------- |
| 2.0.1 | Registrar `mapasus.com.br`, `mapasus.org.br`, `mapasus.app.br` no Registro.br | ~R$ 120/ano      |
| 2.0.2 | Reservar handles: `@mapasus` no GitHub, Twitter/X, LinkedIn, Instagram        | grátis           |
| 2.0.3 | Criar logo/identidade visual (manter verde-esmeralda atual, novo wordmark)    | 1-2h Figma/Canva |
| 2.0.4 | Adicionar domínios no Vercel + DNS no Registro.br                             | 30 min           |
| 2.0.5 | Disclaimer redigido pelo Claude → revisar legalmente                          | 1h               |

**Critério de saída:** os 3 domínios resolvem para Vercel (mesmo que ainda mostrem o site atual).

### Phase 2.1 — Repo rename + estrutura · ~0,5 dia

| Passo | Ação                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| 2.1.1 | Renomear repo no GitHub: `hospitais-referencia-api` → `mapasus-platform`             |
| 2.1.2 | Atualizar `package.json` (web + root) — nome `mapasus`                               |
| 2.1.3 | Atualizar README com nova narrativa de plataforma                                    |
| 2.1.4 | Atualizar referências internas (badges, links, CI configs)                           |
| 2.1.5 | Manter `hospitais-referencia-web.vercel.app` apontando pro mesmo deploy (não quebra) |

**Critério de saída:** `git clone mapasus-platform` funciona, CI verde.

### Phase 2.2 — Migração de schema · ~1 dia

| Passo | Ação                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------ |
| 2.2.1 | Backup completo do Supabase de produção (já temos script)                                        |
| 2.2.2 | Aplicar `sql/009_multi_vertical.sql` no Supabase local                                           |
| 2.2.3 | Validar: `SELECT vertical, count(*) FROM hospital_specialties GROUP BY vertical`                 |
| 2.2.4 | Atualizar repositories: novo método `findByVertical(vertical, filters)`                          |
| 2.2.5 | API existente continua respondendo (`/v1/hospitals` filtra `vertical='peconhentos'` por default) |
| 2.2.6 | Aplicar em produção                                                                              |

**Critério de saída:** API atual continua funcionando. Nova tabela `hospital_specialties` populada com ≥ todos os registros que existiam em `treatments`.

### Phase 2.3 — API namespacing · ~1 dia

| Passo | Ação                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| 2.3.1 | Adicionar rotas `/v1/peconhentos/hospitals`, `/v1/peconhentos/hospitals/nearby`, `/v1/peconhentos/states`     |
| 2.3.2 | `/v1/hospitals` antigo vira **alias 301** pra `/v1/peconhentos/hospitals` (não quebra integrações existentes) |
| 2.3.3 | Adicionar `/v1/search?q=&vertical=all` — busca cross-vertical                                                 |
| 2.3.4 | Atualizar `/v1/stats` para agregar por vertical                                                               |
| 2.3.5 | Atualizar `docs` page com nova estrutura                                                                      |

**Critério de saída:** ambas as URLs (`/v1/hospitals` e `/v1/peconhentos/hospitals`) retornam o mesmo payload.

### Phase 2.4 — Web multi-tenant routing · ~1,5 dia

| Passo | Ação                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| 2.4.1 | Criar `web/middleware.ts` com host-based rewrite                                                               |
| 2.4.2 | Reorganizar `app/` em route groups: `(hub)`, `(peconhentos)`, `(raras)`, `(oncologia)`                         |
| 2.4.3 | Mover páginas atuais para `(peconhentos)`                                                                      |
| 2.4.4 | Criar `(hub)/page.tsx` — landing page MapaSUS                                                                  |
| 2.4.5 | Navbar dinâmica por vertical (links + cor de destaque diferem)                                                 |
| 2.4.6 | Configurar `peconhentos.mapasus.com.br` no Vercel                                                              |
| 2.4.7 | Configurar redirect 301 de `hospitais-referencia-web.vercel.app` → `peconhentos.mapasus.com.br` (preserva SEO) |

**Critério de saída:** acessar `mapasus.com.br` mostra hub; `peconhentos.mapasus.com.br` mostra busca atual; URL antiga redireciona.

### Phase 2.5 — Vertical Doenças Raras · ~2 dias

| Passo | Ação                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------ |
| 2.5.1 | Implementar `scripts/raras/sync.js` — parser do XLSX oficial (formato bem mais simples que PDFs) |
| 2.5.2 | Implementar geocoding pros novos hospitais (reusa `lib/services/geocoding`)                      |
| 2.5.3 | Especialidades: `doencas_raras_geral`, `terapia_genica_ame`, etc.                                |
| 2.5.4 | Criar páginas em `(raras)/`: home, busca por estado/cidade, FAQ específico                       |
| 2.5.5 | Cron diário no Vercel pra sync                                                                   |
| 2.5.6 | Schema.org Dataset markup específico                                                             |
| 2.5.7 | Deploy em `raras.mapasus.com.br`                                                                 |

**Critério de saída:** busca em `raras.mapasus.com.br` retorna os ~150 centros habilitados.

### Phase 2.6 — Vertical Oncologia · ~3 dias

Mesma estrutura da 2.5, mas:

- 3 fontes XLSX (alta complexidade, sincrônico, reconstrução mamária)
- 317 hospitais
- Especialidades: `oncologia_alta_complexidade`, `radioterapia`, `quimioterapia`, `reconstrucao_mamaria`, etc.
- Filtros: tipo de câncer (CACON vs UNACON)

**Critério de saída:** `oncologia.mapasus.com.br` no ar com 317 hospitais buscáveis.

### Phase 2.7 — Hub portal + cross-vertical search · ~1,5 dia

| Passo | Ação                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------- |
| 2.7.1 | Landing page do hub com 3 cards (uma por vertical) + métrica agregada                             |
| 2.7.2 | Barra de busca cross-vertical no hub ("Curitiba" → mostra peçonhentos + oncologia + raras juntos) |
| 2.7.3 | Página `/sobre` com narrativa da plataforma + disclaimer de iniciativa independente               |
| 2.7.4 | Página `/imprensa` com press kit (importante pra divulgação NIW)                                  |
| 2.7.5 | llms.txt e sitemap atualizados pro hub                                                            |

**Critério de saída:** mapasus.com.br como entrada única, hub linka para 3 verticais, busca cross-vertical funciona.

### Phase 2.8 — Polimento + lançamento · ~1 dia

- OG image dinâmica por vertical
- Métricas no PostHog separadas por vertical
- Atualizar README pra refletir plataforma
- Post no dev.to + LinkedIn anunciando o lançamento (insumo de divulgação NIW)
- E-mail/contato para Tem Saúde, Sentry, CIATs anunciando expansão

**Critério de saída:** anúncio público feito.

## 6. Cronograma

```
Semana 1
  Seg     Phase 2.0 (operacional)
  Ter-Qua Phase 2.1 + 2.2 + 2.3 (rename + schema + API)
  Qui     Phase 2.4 (multi-tenant)
  Sex     Phase 2.5 (raras)

Semana 2
  Seg     Phase 2.5 (raras, finaliza)
  Ter-Qui Phase 2.6 (oncologia)
  Sex     Phase 2.7 (hub + cross-search)

Semana 3
  Seg     Phase 2.8 (polimento + lançamento)
```

**Total: ~11 dias úteis (~2,5 semanas)**

## 7. Riscos e mitigações

| Risco                                            | Probabilidade         | Mitigação                                                                                 |
| ------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| Vercel Hobby 12-function limit                   | Baixa                 | API continua sendo `api/index.js` única; já resolvemos antes                              |
| Confusão com MS sobre o nome                     | Baixa                 | Disclaimer + identidade visual distinta + `.com.br`                                       |
| Quebra de SEO atual durante migração             | Média                 | Redirect 301 preserva 95% do link juice; canonicals atualizados                           |
| Dados de raras/oncologia desatualizados na fonte | Alta (problema do MS) | Mesma estratégia atual: data de atualização visível + disclaimer "confirme com a unidade" |
| XLSX mudar de schema entre meses                 | Média                 | Parser tolerante + alertas no Slack/email quando colunas mudam                            |

## 8. Métricas de sucesso

| Métrica                                | Atual (peçonhentos) | Meta pós-migração |
| -------------------------------------- | ------------------- | ----------------- |
| Hospitais indexados                    | ~500                | ~1.000+           |
| Verticais                              | 1                   | 3                 |
| Buscas/mês                             | (medir hoje)        | 3x atual          |
| Backlinks de imprensa                  | 0                   | ≥ 3               |
| Citações por LLMs (testar mensalmente) | 0–1                 | ≥ 5               |

## 9. Para o dossiê NIW

Esta migração produz, **simultaneamente**:

1. **Evidência técnica adicional**: 3 verticais ≠ 3 sites, demonstra arquitetura escalável
2. **Material de divulgação**: post de anúncio = imprensa
3. **Endossos diversificados**: oncologistas + toxicologistas + especialistas em raras assinam pela MESMA plataforma
4. **Numeros agregados maiores**: 1.000+ hospitais cobertos > 500
5. **Argumento NIW mais forte**: "plataforma de transparência em saúde pública" > "ferramenta de busca de hospitais"

## 10. Próximas decisões pendentes

- [ ] Confirmar registro dos 3 domínios (você)
- [ ] Aprovar identidade visual MapaSUS (verde-esmeralda mantido?)
- [ ] Decidir se mantém GitHub org `Codar-Sistemas` ou cria `MapaSUS-BR`
- [ ] Definir cadência de release: tudo de uma vez ou liberar vertical por vertical?
- [ ] Definir se vai pedir CNPJ próprio para a iniciativa (ajuda no NIW como "empreendimento estruturado")
