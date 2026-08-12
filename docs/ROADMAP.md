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
- [ ] Coletor DEMAS genérico (`scripts/providers/`?): endpoint + paginação + backoff +
      guardrails de contagem, parametrizado por `codigo_tipo_unidade`
- [ ] Monitor de fontes: sonda diária (status/hash) das fontes de cada vertical, alertando
      em mudança de formato, despublicação **e reativação** — se a página de peçonhentos
      voltar, saber no mesmo dia

### Fase 1 — Enriquecimento CNES das verticais atuais

- Join por CNES via DEMAS para os registros existentes: telefone, endereço, horário,
  lat/lng oficiais
- Política de conflito: oficial **confirma** o extraído → baixa `requires_verification`;
  **diverge** → manter ambos com flag de divergência (nunca sobrescrever em silêncio)
- `data_atualizacao` do CNES por registro (frescor granular)
- Geocoding próprio vira fallback de quem não tem coordenada no CNES

### Fase 2 — Verticais 4 e 5: CAPS + Hemorrede

- `mental_health` (tipo 70) com subtipo (CAPS I/II/III, AD, AD III/IV, infantojuvenil)
  via `rlEstabSubTipo` da base mensal — o inventário dispensou o dataset RAPS
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
