# Inventário da base CNES — fase 0 do roadmap CNES-first

_Levantado em 12/08/2026 sobre `BASE_DE_DADOS_CNES_202507.ZIP` (dados reais, não documentação)._

## As três fontes CNES e o que cada uma dá

| Fonte                                                                                | Conteúdo                                                                                             | Formato / peso                                              | Atualização                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| **API DEMAS** `apidadosabertos.saude.gov.br/cnes/*`                                  | Cadastro do estabelecimento: nome, endereço, **lat/lng, telefone, horário**, tipo de unidade, status | JSON sem auth                                               | segue o ciclo CNES             |
| **Base mensal** `ftp://ftp.datasus.gov.br/cnes/BASE_DE_DADOS_CNES_YYYYMM.ZIP`        | 108 CSVs (2,7 GB descomprimida): estabelecimentos, **subtipos**, serviços, leitos, equipamentos      | ZIP 615 MB; CSVs `;`-separados, latin-1, aspas              | mensal                         |
| **Disseminação** `ftp://ftp.datasus.gov.br/dissemin/publicos/CNES/200508_/Dados/HB/` | **Habilitações por estabelecimento** (`HB{UF}{AAMM}.dbc`, ex.: `HBSP2606.dbc`, ~190 KB/UF·mês)       | `.dbc` (DBF comprimido — ler com `pyreaddbc`/`datasus-dbc`) | mensal, confirmado até 06/2026 |

**Surpresa do levantamento:** a base mensal _não_ traz a relação estabelecimento↔habilitação
(`rlEstabProgFundo` é programa/fundo, outra coisa). Habilitação por estabelecimento vive nos
`HB*.dbc` da disseminação. Em compensação, a base mensal traz os **subtipos** — que é o que
CAPS e hemorrede precisam, dispensando o dataset RAPS do CKAN.

## Tabelas-chave da base mensal

| Arquivo                  | Tamanho | Papel                                                                             |
| ------------------------ | ------- | --------------------------------------------------------------------------------- |
| `tbEstabelecimento`      | 273 MB  | Cadastro completo (chave `CO_UNIDADE`, 13 dígitos = UF+município+CNES)            |
| `rlEstabSubTipo`         | 7,5 MB  | `CO_UNIDADE` ↔ `CO_TIPO_UNIDADE` + `CO_SUB_TIPO_UNIDADE` (+ datas de atualização) |
| `tbSubTipo`              | 3,5 KB  | Catálogo de subtipos por tipo de unidade                                          |
| `tbSubGruposHabilitacao` | 33 KB   | Catálogo de códigos de habilitação (join com os `HB*.dbc`)                        |
| `tbTipoUnidade`          | 1,5 KB  | Catálogo de tipos (69 = hemoterapia, 70 = CAPS, ...)                              |

## Códigos levantados (dados reais de 07/2025)

### CAPS — subtipos do tipo de unidade 70 (3.742 estabelecimentos em `rlEstabSubTipo`)

| `CO_SUB_TIPO` | Descrição               |
| ------------- | ----------------------- |
| 001           | CAPS I                  |
| 002           | CAPS II                 |
| 003           | CAPS III                |
| 004           | CAPS INFANTO/JUVENIL    |
| 005           | CAPS ÁLCOOL E DROGA     |
| 006           | CAPS AD III — MUNICIPAL |
| 007           | CAPS AD III — REGIONAL  |
| 008           | CAPS AD IV              |

Habilitações equivalentes (nos `HB*.dbc`): 0616 (CAPS I), 0617 (II), 0618 (III),
0619 (AD), 0620 (infantil), 0635 (AD III), 0637 (AD IV) — dupla checagem possível
subtipo × habilitação.

### Hemorrede — subtipos do tipo de unidade 69

| `CO_SUB_TIPO` | Descrição                                          | Doação?                    |
| ------------- | -------------------------------------------------- | -------------------------- |
| 001           | Coordenador                                        | ✅                         |
| 002           | Regional                                           | ✅                         |
| 003           | Núcleo                                             | ✅                         |
| 004           | Unidade de Coleta e Transfusão (UCT)               | ✅                         |
| 005           | Unidade de Coleta (UC)                             | ✅                         |
| 006           | Central de Triagem Laboratorial de Doadores (CTLD) | triagem                    |
| 007           | Agência Transfusional (AT)                         | ❌ (transfusão hospitalar) |

O subtipo separa exatamente o caso de uso "onde doar sangue" (001–005) do que não é
ponto de doação (AT) — o filtro da vertical nasce pronto.

### Diálise/TRS — habilitações

`1501` Unidade de alta complexidade em nefrologia · `1502` Centro de referência ·
`1503` Hemodiálise II · `1504` Atenção especializada em DRC com hemodiálise ·
`1505` DRC com diálise peritoneal · `8244` Unidade na DRC com ou sem TRS/diálise.

### Queimados — habilitações

`2101` Centro de referência — média complexidade · `2102` Centro de referência — alta
complexidade · `2607` UTI queimados. (Confirma: não há lista editorial; a fonte é esta.)

### Cross-check da vertical de oncologia (validação do pipeline atual)

`1701–1703` CACON I/II/III (legado) · `1712/1713` CACON · `1706–1711` UNACON e variações ·
`1704/1715` radioterapia · `1722` tratamentos sincrônicos. Os códigos que extraímos hoje
dos PDFs da SAES podem ser conferidos contra os `HB*.dbc` — bom teste de consistência
antes de confiar na fonte nova.

### Gestação de alto risco (backlog)

`1413` GAR I · `1414` GAR II · `1415/8237` Casa da Gestante, Bebê e Puérpera.

## Recomendações que saem deste inventário

1. **CAPS e hemorrede (fase 2)**: coletar pela API DEMAS (tipo 70/69) e enriquecer o
   subtipo com `rlEstabSubTipo` da base mensal. Dataset RAPS do CKAN fica dispensado.
2. **Diálise e queimados (fases 3/5)**: exigem o leitor de `HB*.dbc` (27 UFs × ~190 KB/mês;
   `pyreaddbc` no stack Python já existente). O mesmo leitor destrava GAR e o cross-check
   de oncologia — construir uma vez, usar em quatro lugares.
3. **Histórico de habilitações (fase 4)**: os `HB*.dbc` são mensais desde 2005 — o diff
   mês a mês dá a timeline "ganhou/perdeu habilitação" sem depender do DOU (o DOU vira o
   enriquecimento com o link da portaria, não a fonte primária do evento).
4. **Encoding e chaves**: tudo latin-1; a chave `CO_UNIDADE` (13 dígitos) embute
   UF+município+CNES — o CNES puro são os 7 dígitos finais.
