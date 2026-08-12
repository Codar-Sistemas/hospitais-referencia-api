# Roadmap — MapaSUS CNES-first

_Elaborado em 12/08/2026. Fontes marcadas como "validada" foram testadas ao vivo nessa data._

## A tese

O projeto nasceu **PDF-first** (listas da SAES, OCR, `requires_verification`). O ecossistema
de dados do Ministério da Saúde permite virar **CNES-first com PDF de exceção**, mudando
três coisas de uma vez:

1. **Qualidade** — dado oficial estruturado substitui extração de OCR; `requires_verification` despenca.
2. **Velocidade** — vertical nova deixa de exigir parser novo e vira _configuração_ (um
   código de tipo de unidade ou de habilitação).
3. **Resiliência** — redundância de fontes: quando uma morre (login wall de peçonhentos,
   ver `docs/INCIDENT-2026-07-VENOMOUS-SOURCE-UNPUBLISHED.md`) ou volta, quem tem duas não para.

## Fontes

| Fonte                                                                                | O que dá                                                                                                                                                                                                          | Formato          | Status                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| **API DEMAS** — `apidadosabertos.saude.gov.br` (oficial: DEMAS/SEIDIGI/MS)           | Estabelecimentos com lat/lng, telefone, endereço, horário; lookup por CNES (`/cnes/estabelecimentos/{codigo_cnes}`); filtros `codigo_tipo_unidade`, `codigo_uf`, `codigo_municipio`, `status`, `data_atualizacao` | JSON, sem auth   | ✅ Validada (CAPS = tipo 70, hemocentros = tipo 69)      |
| **Base mensal CNES** — `ftp://ftp.datasus.gov.br/cnes/BASE_DE_DADOS_CNES_YYYYMM.ZIP` | Habilitações por estabelecimento, subtipos, serviços especializados, leitos                                                                                                                                       | ZIP/CSV mensal   | Inventário na fase 0 (`docs/internal/CNES_INVENTORY.md`) |
| **CKAN do MS** — opendatasus + dadosabertos                                          | Dataset RAPS (subtipo de CAPS), hospitais/leitos                                                                                                                                                                  | CSV via API CKAN | A validar na fase 2                                      |
| **DOU** — in.gov.br (XML diário)                                                     | Portarias de habilitação: eventos "ganhou/perdeu" com data e norma                                                                                                                                                | XML aberto       | Fase 4                                                   |
| **PDFs gov.br (fonte atual)**                                                        | Listas editoriais da SAES                                                                                                                                                                                         | PDF/OCR          | Rebaixar a exceção/verificação                           |
| **BrasilAPI / IBGE**                                                                 | CEP→coordenada (já usado); população municipal                                                                                                                                                                    | JSON             | Enriquecimento                                           |

Ressalvas de engenharia: a API DEMAS não documenta rate limit (manter a serialização +
backoff que os syncs já usam); o `swagger.json` dela vem com JSON malformado (vírgulas
penduradas) — parser defensivo sempre; `data_atualizacao` do CNES anda em ciclo mensal e
depende do gestor municipal — não é tempo real, e o frescor por UF que já exibimos cobre
isso com honestidade.

## Fases

### Fase 0 — Fundações _(esta branch)_

- [x] Baixar uma base mensal do CNES e inventariar tabelas de habilitação/subtipo
      (nomes reais, códigos de CAPS I/II/III/AD/i, TRS/diálise, queimados, cross-check
      de UNACON/CACON) → `docs/internal/CNES_INVENTORY.md`
- [x] Coletor DEMAS genérico: `CnesApiProvider.list_by_unit_type` em
      `scripts/providers/cnes_api.py` — paginação em passos de 20 (a API trava o
      `limit` silenciosamente), backoff, e erro em falha persistente em vez de
      truncar (lista truncada viraria "fechamento em massa" no diff)
- [x] Monitor de fontes: a sonda diária já existia nos syncs (status por UF, hash de PDF,
      aviso de despublicação no step summary). O que faltava era o **alerta de
      reativação**: agora, quando um estado que estava `source_unpublished` volta a
      responder, o run emite `::notice` + step summary "Fonte REPUBLICADA" — se a página
      de peçonhentos voltar, sabemos no mesmo dia. Fontes novas (API DEMAS) nascem
      protegidas pelos guardrails do próprio coletor.

### Fase 1 — Enriquecimento CNES das verticais atuais _(esta branch)_

- [x] Batch de confirmação/enriquecimento: `scripts/enrichment` (CLI
      `python -m scripts.enrichment [--vertical] [--limit] [--dry-run]`), workflow
      semanal `enrich-cnes.yml`. Preenche address/phones/coords **apenas quando
      vazios** — nunca sobrescreve valor extraído.
- [x] Política de conflito (`scripts/enrichment/policy.py`, pura e testada): oficial
      **confirma** o extraído (≥1 sinal forte — telefone ou coordenadas — e zero
      contradições) → `cnes_confirmed` derruba `requires_verification` (sql/027);
      **diverge** → `cnes_divergences` registra os campos, sem sobrescrever nada.
      Ausência de contradição NÃO confirma.
- [x] `cnes_checked_at` por registro (frescor granular da checagem)
- [x] Coordenada oficial preenche quem estava `pending`; Nominatim segue como fallback
      (raras/oncologia já enriqueciam no próprio sync via `enrich_with_cnes` — o batch
      cobre principalmente peçonhentos, a vertical com OCR)
- [ ] Aplicar `sql/027_cnes_confirmation.sql` em produção (migração revisada à mão,
      como todas)

### Fase 2 — Verticais 4 e 5: CAPS + Hemorrede

- [x] **Fase 2a — pipeline de dados do CAPS** (`scripts/syncs/mental_health`): DEMAS
      lista o tipo 70; o subtipo (CAPS I/II/III, AD, AD III/IV, infantojuvenil) vem do
      serviço JSON do site do CNES (`/services/estabelecimentos/{CO_UNIDADE}`,
      `dsStpUnidade`) — nem a base mensal de 615 MB nem o dataset RAPS foram
      necessários. Subtipos viram `hospital_specialties` (caps_i…caps_ad_iv),
      `extraction_source = cnes_api` (sql/028). Guardrail: aborta se >20% das unidades
      ficarem sem detalhe.
- [ ] **Fase 2b — exposição pública do CAPS**: wiring do backend (`Vertical` em
      `lib/types/domain.ts` + `KNOWN_VERTICALS` + `URL_TO_DB_VERTICAL`), registro no
      web (`web/lib/verticals.ts`), vocabulário PT, aviso editorial (CVV 188 — texto
      revisado por humano), workflow de sync agendado, espelho no BrasilAPI
- [ ] `blood_centers` (tipo 69) — mesmo coletor, código diferente; subtipos UCT/UC/
      núcleo separam "onde doar" de agência transfusional
- `blood_centers` (tipo 69) — mesmo coletor, código diferente
- Vocabulário PT ("caps ad", "doar sangue") no padrão dos soros; avisos editoriais por
  vertical (CVV 188 em saúde mental; requisitos de doação em hemorrede) — texto revisado
  por humano, nunca gerado por script
- Espelhar no BrasilAPI (`/hospitais/v1` já é multi-vertical)

### Fase 3 — Diálise/TRS

- Habilitações de TRS pela base CNES; modelo igual ao de oncologia
  (`specialty` + `qualification_codes` — o parser de portarias reusa quase tudo)

### Fase 4 — Diferenciais

- **Histórico de habilitações**: diff mensal dos `HB*.dbc` da disseminação (existem desde 2005) → timeline "ganhou/perdeu" por estabelecimento; o DOU entra como enriquecimento
  (link da portaria), não como fonte primária do evento
- **Desertos assistenciais**: distância município→serviço mais próximo por vertical +
  população (IBGE); computado no snapshot, custo zero de runtime

### Fase 5 — Backlog qualificado

- Queimados (via habilitações; sem lista nacional consolidada publicada)
- Urgência (tipos 20/21/73, centrais 76) — avaliar fit de produto
- Gestação de alto risco / maternidades

## Ordem e porquê

**0 → 1 → 2 → (3 ∥ 4) → 5.** O enriquecimento (fase 1) vem antes das verticais novas de
propósito: prova o pipeline DEMAS em dados que já conhecemos, com risco zero de contrato.
