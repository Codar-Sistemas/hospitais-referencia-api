# Refactoring Map — Portuguese → English

> Reference document for Phase 0 standardization. All technical identifiers
> (tables, columns, variables, functions, files, query params, JSON fields)
> will be migrated to English. **User-facing UI text remains in Portuguese**
> (the product targets Brazilian users).

## Conventions

| Layer                                     | Case                                               |
| ----------------------------------------- | -------------------------------------------------- |
| SQL (tables, columns, indexes, functions) | `snake_case`                                       |
| Python (modules, functions, variables)    | `snake_case`                                       |
| Python classes                            | `PascalCase`                                       |
| JS/TS (variables, functions)              | `camelCase`                                        |
| TS types, interfaces, React components    | `PascalCase`                                       |
| Files (JS/TS)                             | `kebab-case.ts` or `PascalCase.tsx` for components |
| Files (Python)                            | `snake_case.py`                                    |
| Env vars                                  | `UPPER_SNAKE_CASE`                                 |
| API query params                          | `snake_case` (REST convention)                     |
| JSON response fields                      | `snake_case` (matches DB)                          |

## Decision log

- **API route paths**: rename `/v1/hospitais` → `/v1/hospitals`, `/v1/estados` → `/v1/states`. No `/v2` — direct rename of `/v1`.
- **`atendimentos`** → **`treatments`** (medical context — more accurate than generic `services`).
- **`unidade`** → **`name`** (it's the hospital's name, not a generic "unit").
- **`uf`** → **`state_code`** (full table columns and Python). For brevity in API params and TS, also `state_code`.
- **`cep`**: kept (Brazilian postal code, no English equivalent in the domain; widely understood).
- **`cnes`**: kept (Brazilian National Health Registry — acronym, not translatable).
- **`pdf_texto`** (enum value) → **`pdf_text`**.
- **Status enum values**: `ok`/`ok_ocr` kept, `erro` → `error`, `nao_suportado` → `unsupported`, `pendente` → `pending`.
- **`lat`/`lng`** in code: kept short (widespread convention). In DB columns: also `latitude`/`longitude` to match auditor proposal? → **Decision: keep `lat`/`lng` in SQL too** for consistency with code and shorter queries.

---

## 1 — SQL

### 1.1 Tables

| Current (PT)    | New (EN)               |
| --------------- | ---------------------- |
| `estados`       | `states`               |
| `hospitais`     | `hospitals`            |
| `cep_cache`     | `cep_cache` _(kept)_   |
| `geocode_cache` | `geocoding_cache`      |
| `api_metrics`   | `api_metrics` _(kept)_ |

### 1.2 Columns — `states` (was `estados`)

| Current           | New                 |
| ----------------- | ------------------- |
| `uf`              | `state_code`        |
| `nome`            | `name`              |
| `pagina_url`      | `page_url`          |
| `pdf_url`         | `pdf_url` _(kept)_  |
| `formato`         | `format`            |
| `atualizado_em`   | `updated_at`        |
| `sincronizado_em` | `synced_at`         |
| `pdf_hash`        | `pdf_hash` _(kept)_ |
| `total_hospitais` | `total_hospitals`   |
| `status`          | `status` _(kept)_   |
| `ultimo_erro`     | `last_error`        |

### 1.3 Columns — `hospitals` (was `hospitais`)

| Current              | New                     |
| -------------------- | ----------------------- |
| `id`                 | `id` _(kept)_           |
| `uf`                 | `state_code`            |
| `municipio`          | `city`                  |
| `unidade`            | `name`                  |
| `endereco`           | `address`               |
| `telefones`          | `phones`                |
| `cnes`               | `cnes` _(kept)_         |
| `atendimentos`       | `treatments`            |
| `atendimentos_raw`   | `treatments_raw`        |
| `criado_em`          | `created_at`            |
| `atualizado_em`      | `updated_at`            |
| `lat`                | `lat` _(kept)_          |
| `lng`                | `lng` _(kept)_          |
| `geocode_status`     | `geocoding_status`      |
| `geocode_fonte`      | `geocoding_source`      |
| `geocode_em`         | `geocoded_at`           |
| `municipio_norm`     | `city_normalized`       |
| `fonte_extracao`     | `extraction_source`     |
| `confianca_ocr`      | `ocr_confidence`        |
| `requer_verificacao` | `requires_verification` |

### 1.4 Columns — `cep_cache`

| Current         | New            |
| --------------- | -------------- |
| `cep`           | `cep` _(kept)_ |
| `logradouro`    | `street`       |
| `bairro`        | `neighborhood` |
| `cidade`        | `city`         |
| `uf`            | `state_code`   |
| `lat`           | `lat` _(kept)_ |
| `lng`           | `lng` _(kept)_ |
| `consultado_em` | `queried_at`   |

### 1.5 Columns — `geocoding_cache` (was `geocode_cache`)

| Current      | New                  |
| ------------ | -------------------- |
| `query_key`  | `query_key` _(kept)_ |
| `lat`        | `lat` _(kept)_       |
| `lng`        | `lng` _(kept)_       |
| `fonte`      | `source`             |
| `hit_count`  | `hit_count` _(kept)_ |
| `criado_em`  | `created_at`         |
| `ultimo_hit` | `last_hit_at`        |

### 1.6 Columns — `api_metrics`

| Current        | New                     |
| -------------- | ----------------------- |
| `id`           | `id` _(kept)_           |
| `criado_em`    | `created_at`            |
| `rota`         | `route`                 |
| `metodo`       | `method`                |
| `status`       | `status` _(kept)_       |
| `duracao_ms`   | `duration_ms`           |
| `ip_hash`      | `ip_hash` _(kept)_      |
| `user_agent`   | `user_agent` _(kept)_   |
| `uf`           | `state_code`            |
| `cache_hit`    | `cache_hit` _(kept)_    |
| `rate_limited` | `rate_limited` _(kept)_ |
| `erro_tipo`    | `error_type`            |
| `erro_msg`     | `error_message`         |

### 1.7 Indexes

| Current                            | New                                   |
| ---------------------------------- | ------------------------------------- |
| `idx_hospitais_uf`                 | `idx_hospitals_state_code`            |
| `idx_hospitais_municipio`          | `idx_hospitals_city`                  |
| `idx_hospitais_cnes`               | `idx_hospitals_cnes`                  |
| `idx_hospitais_atendimentos`       | `idx_hospitals_treatments`            |
| `idx_hospitais_fts`                | `idx_hospitals_fts`                   |
| `idx_hospitais_geo`                | `idx_hospitals_geo`                   |
| `idx_hospitais_municipio_norm`     | `idx_hospitals_city_normalized`       |
| `idx_geocode_cache_criado`         | `idx_geocoding_cache_created_at`      |
| `idx_api_metrics_criado_em`        | `idx_api_metrics_created_at`          |
| `idx_api_metrics_rota`             | `idx_api_metrics_route`               |
| `idx_api_metrics_status`           | `idx_api_metrics_status` _(kept)_     |
| `idx_hospitais_requer_verificacao` | `idx_hospitals_requires_verification` |

### 1.8 Functions / RPCs

| Current                                                                    | New                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `hospitais_proximos(p_lat, p_lng, p_raio_m, p_uf, p_atendimento, p_limit)` | `nearby_hospitals(p_lat, p_lng, p_radius_m, p_state_code, p_treatment, p_limit)` |
| return column `distancia_m`                                                | `distance_m`                                                                     |
| `limpar_metricas_antigas()`                                                | `cleanup_old_metrics()`                                                          |

### 1.9 Views

| Current                  | New                          |
| ------------------------ | ---------------------------- |
| `metrics_24h`            | `metrics_24h` _(kept)_       |
| `metrics_rotas_24h`      | `metrics_routes_24h`         |
| `metrics_cache_24h`      | `metrics_cache_24h` _(kept)_ |
| `metrics_erros_recentes` | `metrics_recent_errors`      |
| `metrics_por_hora`       | `metrics_hourly`             |

### 1.10 RLS Policies

| Current                        | New                              |
| ------------------------------ | -------------------------------- |
| `"estados: leitura pública"`   | `"states: public read"`          |
| `"hospitais: leitura pública"` | `"hospitals: public read"`       |
| `"cep_cache: leitura pública"` | `"cep_cache: public read"`       |
| `geocode_cache_select_anon`    | `geocoding_cache_select_anon`    |
| `geocode_cache_all_service`    | `geocoding_cache_all_service`    |
| `metrics_service_write`        | `metrics_service_write` _(kept)_ |

### 1.11 Enum / check-constraint values

| Current           | New                  |
| ----------------- | -------------------- |
| `'pdf_texto'`     | `'pdf_text'`         |
| `'pdf_ocr'`       | `'pdf_ocr'` _(kept)_ |
| `'ok'` (status)   | `'ok'` _(kept)_      |
| `'ok_ocr'`        | `'ok_ocr'` _(kept)_  |
| `'erro'`          | `'error'`            |
| `'nao_suportado'` | `'unsupported'`      |
| `'pendente'`      | `'pending'`          |

---

## 2 — Backend (`api/`)

### 2.1 Files

| Current                | New                                    |
| ---------------------- | -------------------------------------- |
| `api/index.js`         | `api/index.js` _(kept — Vercel entry)_ |
| `api/metrics.js`       | `api/lib/metrics.js` _(moved)_         |
| `api/providers/cep.js` | `api/providers/cep.js` _(kept)_        |

### 2.2 New structure

```
api/
├── index.js                 # Vercel entry, route dispatch only
├── handlers/
│   ├── states.js
│   ├── hospitals.js
│   └── metadata.js
├── services/
│   ├── hospital-service.js
│   ├── geocoding-service.js
│   └── search-normalizer.js
├── repositories/
│   ├── hospital-repo.js
│   ├── state-repo.js
│   └── cep-repo.js
├── middleware/
│   ├── rate-limit.js
│   ├── cors.js
│   └── metrics.js
├── lib/
│   ├── supabase.js
│   ├── redis.js
│   ├── errors.js
│   └── metrics.js
└── providers/
    └── cep.js
```

### 2.3 API routes

| Current                      | New                          |
| ---------------------------- | ---------------------------- |
| `GET /v1/estados`            | `GET /v1/states`             |
| `GET /v1/estados/:uf`        | `GET /v1/states/:state_code` |
| `GET /v1/hospitais`          | `GET /v1/hospitals`          |
| `GET /v1/hospitais/:id`      | `GET /v1/hospitals/:id`      |
| `GET /v1/hospitais/proximos` | `GET /v1/hospitals/nearby`   |

### 2.4 Query parameters

| Current       | New               |
| ------------- | ----------------- |
| `uf`          | `state_code`      |
| `municipio`   | `city`            |
| `atendimento` | `treatment`       |
| `q`           | `q` _(kept)_      |
| `limit`       | `limit` _(kept)_  |
| `offset`      | `offset` _(kept)_ |
| `raio`        | `radius_m`        |
| `cep`         | `cep` _(kept)_    |
| `lat`         | `lat` _(kept)_    |
| `lng`         | `lng` _(kept)_    |
| `cidade`      | `city`            |

### 2.5 JSON response fields

| Current                 | New                     |
| ----------------------- | ----------------------- |
| `estados`               | `states`                |
| `hospitais`             | `hospitals`             |
| `filtros`               | `filters`               |
| `total_retornados`      | `total_returned`        |
| `municipio`             | `city`                  |
| `distancia_m`           | `distance_m`            |
| `distancia_km`          | `distance_km`           |
| `raio_m`                | `radius_m`              |
| `aviso`                 | `notice`                |
| `origem`                | `origin`                |
| `cidade_fallback`       | `city_fallback`         |
| `cep_sem_coords`        | `cep_no_coords`         |
| `cidade_busca`          | `city_search`           |
| `fonte_extracao`        | `extraction_source`     |
| `confianca_ocr`         | `ocr_confidence`        |
| `requer_verificacao`    | `requires_verification` |
| `requires_verification` | `requires_verification` |

### 2.6 Variables / functions in `api/index.js`

| Current                 | New                    |
| ----------------------- | ---------------------- |
| `TIPOS_CANONICOS`       | `CANONICAL_TREATMENTS` |
| `normalizeTipo`         | `normalizeTreatment`   |
| `consultarCep`          | `lookupCep`            |
| `listEstados`           | `listStates`           |
| `getEstado`             | `getState`             |
| `listHospitais`         | `listHospitals`        |
| `getHospital`           | `getHospital`          |
| `listHospitaisProximos` | `listNearbyHospitals`  |
| `municipio`             | `city`                 |
| `atendimentoRaw`        | `treatmentRaw`         |
| `atendimentoCanonical`  | `treatmentCanonical`   |
| `origem`                | `origin`               |
| `cidadeBusca`           | `citySearch`           |
| `cidadeNorm`            | `cityNormalized`       |
| `ufCapturada`           | `capturedStateCode`    |
| `raio`                  | `radius`               |
| `cidade`                | `city`                 |
| `inicio`                | `startTime`            |
| `trackReq`              | `trackRequest`         |
| `rota`                  | `route`                |
| `filtros`               | `filters`              |
| `total_retornados`      | `total_returned`       |
| `pendentes`             | `pending`              |

### 2.7 Error messages (internal — these are sent to API consumers)

All error messages in API responses → **English** (API is a public technical interface). The web app translates errors to Portuguese for display.

| Current (PT)                                        | New (EN)                                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| "Estado '${uf}' não encontrado"                     | "State '${state_code}' not found"                    |
| "Informe ao menos um filtro: uf, municipio ou q"    | "Provide at least one filter: state_code, city or q" |
| "ID inválido"                                       | "Invalid ID"                                         |
| "Hospital ${n} não encontrado"                      | "Hospital ${id} not found"                           |
| "Atendimento inválido: ..."                         | "Invalid treatment: ..."                             |
| "CEP '${cep}' não encontrado"                       | "CEP '${cep}' not found"                             |
| "Informe ao menos um de: lat+lng, cep, ou cidade"   | "Provide at least one of: lat+lng, cep, or city"     |
| "Não foi possível determinar uma cidade para busca" | "Unable to determine a city for search"              |
| "Limite de ${RATE_LIMIT} requisições..."            | "Rate limit of ${RATE_LIMIT} requests..."            |
| "Rota não encontrada: ${path}"                      | "Route not found: ${path}"                           |
| "Erro interno"                                      | "Internal error"                                     |
| "Método não permitido"                              | "Method not allowed"                                 |

### 2.8 Variables in `api/metrics.js`

| Current          | New             |
| ---------------- | --------------- |
| `rota` (param)   | `route`         |
| `metodo` (param) | `method`        |
| `duracao_ms`     | `duration_ms`   |
| `uf` (param)     | `state_code`    |
| `erro_tipo`      | `error_type`    |
| `erro_msg`       | `error_message` |

---

## 3 — Python scripts (`scripts/`)

### 3.1 New structure

```
scripts/
├── sync/
│   ├── __init__.py
│   ├── runner.py            # entry (was sync.py)
│   ├── scraper.py
│   ├── change_detector.py
│   └── upserter.py
├── parsing/
│   ├── __init__.py
│   ├── text_parser.py       # was parser.py
│   ├── ocr_parser.py        # was parser_ocr.py
│   └── ocr_engine.py        # was ocr.py
├── geocoding/
│   ├── __init__.py
│   ├── runner.py            # was geocode.py
│   └── address_normalizer.py
├── providers/               # kept
│   ├── __init__.py
│   ├── base.py
│   ├── nominatim.py
│   └── brasilapi.py
└── shared/
    ├── __init__.py
    ├── db.py                # Supabase client
    ├── logger.py
    └── config.py
```

### 3.2 Functions (`sync.py` → `sync/runner.py`)

| Current               | New                            |
| --------------------- | ------------------------------ |
| `sync_uf`             | `sync_state`                   |
| `sync_uf_safe`        | `sync_state_safe`              |
| `geocode_pendentes`   | `geocode_pending`              |
| `_is_image_based_pdf` | `_is_image_based_pdf` _(kept)_ |
| `download_pdf`        | `download_pdf` _(kept)_        |
| `fetch_page_metadata` | `fetch_page_metadata` _(kept)_ |

### 3.3 Variables (`sync.py`)

| Current          | New                 |
| ---------------- | ------------------- |
| `RE_ATUALIZADO`  | `RE_UPDATED`        |
| `uf`             | `state_code`        |
| `pagina_url`     | `page_url`          |
| `precisa`        | `needs_update`      |
| `registros`      | `records`           |
| `fonte_extracao` | `extraction_source` |
| `confianca_ocr`  | `ocr_confidence`    |
| `atuais`         | `existing`          |
| `por_chave`      | `by_key`            |
| `ids_vistos`     | `seen_ids`          |
| `para_inserir`   | `to_insert`         |
| `para_atualizar` | `to_update`         |
| `endereco_igual` | `address_equal`     |
| `ids_remover`    | `ids_to_remove`     |
| `pendentes`      | `pending`           |
| `ok`             | `ok_count`          |
| `falhou`         | `failed_count`      |

### 3.4 CLI arguments (`sync.py`)

| Current | New          |
| ------- | ------------ |
| `uf`    | `state_code` |
| `cmd`   | `command`    |

### 3.5 Functions (`parser.py` → `parsing/text_parser.py`)

| Current                  | New                       |
| ------------------------ | ------------------------- |
| `TIPOS_ATENDIMENTO`      | `TREATMENT_TYPES`         |
| `TIPOS_COMPOSTOS`        | `COMPOSITE_TREATMENTS`    |
| `normalize_atendimentos` | `normalize_treatments`    |
| `_strip_accents`         | `_strip_accents` _(kept)_ |
| `_clean`                 | `_clean` _(kept)_         |
| `_cell_text`             | `_cell_text` _(kept)_     |
| `_merge_edges`           | `_merge_edges` _(kept)_   |
| `_extract_page`          | `_extract_page` _(kept)_  |
| `parse_pdf`              | `parse_pdf` _(kept)_      |

### 3.6 Local variables (`parser.py`)

| Current            | New              |
| ------------------ | ---------------- |
| `texto`            | `text`           |
| `encontrados`      | `found`          |
| `chave`            | `key`            |
| `tipos`            | `types`          |
| `tipo`             | `treatment_type` |
| `municipio`        | `city`           |
| `unidade`          | `name`           |
| `endereco`         | `address`        |
| `telefones`        | `phones`         |
| `atend`            | `treatments`     |
| `atendimentos_raw` | `treatments_raw` |

### 3.7 Functions (`parser_ocr.py` → `parsing/ocr_parser.py`)

| Current                          | New                           |
| -------------------------------- | ----------------------------- |
| `class PaginaOcr`                | `class OcrPage`               |
| `_agrupar_linhas`                | `_group_lines`                |
| `_detectar_fronteiras_colunas`   | `_detect_column_boundaries`   |
| `_palavra_para_coluna`           | `_word_to_column`             |
| `_linha_para_registro`           | `_line_to_record`             |
| `_mesclar_linhas_quebradas`      | `_merge_broken_lines`         |
| `_classificar_palavra`           | `_classify_word`              |
| `_estimar_inicio_coluna_unidade` | `_estimate_name_column_start` |
| `_pos_columna_municipio`         | `_city_column_position`       |
| `_municipio_valido`              | `_is_valid_city`              |
| `parse_pdf_ocr`                  | `parse_pdf_ocr` _(kept)_      |

### 3.8 Functions (`geocode.py` → `geocoding/runner.py`)

| Current              | New                   |
| -------------------- | --------------------- |
| `geocode_endereco`   | `geocode_address`     |
| `_geocode_municipio` | `_geocode_city`       |
| `consultar_cep`      | `lookup_cep`          |
| `_limpar_endereco`   | `_clean_address`      |
| `_so_logradouro`     | `_street_only`        |
| `_mem_cache`         | `_memory_cache`       |
| `_sb_url`            | `_supabase_url`       |
| `_sb_headers`        | `_supabase_headers`   |
| `_geo_provider`      | `_geocoding_provider` |

### 3.9 Variables (`geocode.py`)

| Current          | New             |
| ---------------- | --------------- |
| `endereco`       | `address`       |
| `municipio`      | `city`          |
| `uf`             | `state_code`    |
| `endereco_limpo` | `clean_address` |
| `tentativas`     | `attempts`      |
| `resultado`      | `result`        |

### 3.10 Dataclasses (`providers/base.py`)

| Current                      | New                            |
| ---------------------------- | ------------------------------ |
| `GeocodingResult.fonte`      | `GeocodingResult.source`       |
| `CepLookupResult.logradouro` | `CepLookupResult.street`       |
| `CepLookupResult.bairro`     | `CepLookupResult.neighborhood` |
| `CepLookupResult.cidade`     | `CepLookupResult.city`         |
| `CepLookupResult.uf`         | `CepLookupResult.state_code`   |

---

## 4 — Frontend (`web/`)

### 4.1 New structure

```
web/
├── app/
│   ├── page.tsx
│   ├── profissionais/page.tsx     # path kept (PT URL = public-facing)
│   ├── docs/page.tsx
│   ├── termos/page.tsx            # path kept (public)
│   └── stats/page.tsx             # NEW (Phase 2)
├── components/
│   ├── hospital/
│   │   ├── HospitalCard.tsx
│   │   ├── HospitalMap.tsx
│   │   └── HospitalList.tsx       # NEW (extract from page.tsx)
│   ├── search/
│   │   ├── SearchTabs.tsx
│   │   ├── SearchByAnimal.tsx
│   │   ├── SearchByPostalCode.tsx
│   │   └── SearchByCity.tsx
│   ├── ui/                        # primitives
│   └── Navbar.tsx
├── hooks/
│   ├── useHospitalSearch.ts
│   ├── useNearbyHospitals.ts
│   └── useGeolocation.ts
└── lib/
    ├── api-client.ts              # was api.ts
    ├── types.ts                   # shared types
    └── constants.ts               # treatments, states, animals
```

> Note on URL paths: `/profissionais`, `/termos`, `/docs` are kept in PT because they
> are part of the public surface (SEO, shareability). Component/file names are EN.

### 4.2 Types (`lib/types.ts`)

| Current                       | New                              |
| ----------------------------- | -------------------------------- |
| `Hospital.fonte_extracao`     | `Hospital.extraction_source`     |
| `Hospital.confianca_ocr`      | `Hospital.ocr_confidence`        |
| `Hospital.requer_verificacao` | `Hospital.requires_verification` |
| `Hospital.distancia_m`        | `Hospital.distance_m`            |
| `Hospital.distancia_km`       | `Hospital.distance_km`           |
| `Hospital.municipio`          | `Hospital.city`                  |
| `Hospital.unidade`            | `Hospital.name`                  |
| `Hospital.endereco`           | `Hospital.address`               |
| `Hospital.telefones`          | `Hospital.phones`                |
| `Hospital.uf`                 | `Hospital.state_code`            |
| `Hospital.atendimentos`       | `Hospital.treatments`            |

### 4.3 Constants (`lib/constants.ts`)

| Current            | New                |
| ------------------ | ------------------ |
| `ESTADOS`          | `STATES`           |
| `ANIMAIS`          | `ANIMALS`          |
| `ESTADOS[i].uf`    | `STATES[i].code`   |
| `ESTADOS[i].nome`  | `STATES[i].name`   |
| `ANIMAIS[i].valor` | `ANIMALS[i].value` |

### 4.4 API client (`lib/api-client.ts`)

| Current           | New               |
| ----------------- | ----------------- |
| `buscarHospitais` | `searchHospitals` |
| `buscarProximos`  | `searchNearby`    |

### 4.5 Page `page.tsx`

| Current                    | New                        |
| -------------------------- | -------------------------- |
| `Modo` type                | `SearchMode` type          |
| `MODOS`                    | `SEARCH_MODES`             |
| `modo`/`setModo`           | `mode`/`setMode`           |
| `uf`/`setUf`               | `stateCode`/`setStateCode` |
| `cidade`/`setCidade`       | `city`/`setCity`           |
| `hospitais`/`setHospitais` | `hospitals`/`setHospitals` |
| `erro`/`setErro`           | `error`/`setError`         |
| `buscou`/`setBuscou`       | `searched`/`setSearched`   |
| `buscar` (handler)         | `handleSearch`             |
| `resultado`                | `result`                   |

### 4.6 Components

| Current (`HospitalCard.tsx`) | New                     |
| ---------------------------- | ----------------------- |
| `BADGE`                      | `TREATMENT_BADGE_CLASS` |
| `requerVerificacao`          | `requiresVerification`  |
| `maps`                       | `mapsUrl`               |

| Current (`HospitalMap.tsx`) | New          |
| --------------------------- | ------------ |
| `hospitais` (prop & local)  | `hospitals`  |
| `comCoords`                 | `withCoords` |

---

## 5 — DevOps / Config

### 5.1 GitHub Actions (`.github/workflows/sync.yml`)

| Current                          | New              |
| -------------------------------- | ---------------- |
| `sync-hospitais` (workflow name) | `sync-hospitals` |
| `uf` (input)                     | `state_code`     |
| `skip_geocode` (input)           | `skip_geocoding` |
| `tem_pendentes` (output)         | `has_pending`    |
| Step descriptions in PT          | Translate to EN  |

### 5.2 `docker-compose.yml`

| Current                          | New                             |
| -------------------------------- | ------------------------------- |
| `hospitais-referencia-db`        | `reference-hospitals-db`        |
| `hospitais-referencia-postgrest` | `reference-hospitals-postgrest` |
| `hospitais-referencia-api`       | `reference-hospitals-api`       |

> Project folder name `hospitais-referencia-api` and repo name kept (would
> require GitHub repo rename, breaks links). Container names refreshed.

### 5.3 `package.json`

| Current                            | New                   |
| ---------------------------------- | --------------------- |
| `name: "hospitais-referencia-api"` | kept _(matches repo)_ |
| `description` (PT)                 | translate to EN       |

---

## 5.4 — Treatment type translations (medical terms)

API payload + DB store English canonical values. Input query params accept
both EN and PT (aliases) for backwards compatibility.

| Portuguese (current) | English (canonical) | Domain                 |
| -------------------- | ------------------- | ---------------------- |
| `Botrópico`          | `Bothropic`         | Snake (jararaca)       |
| `Crotálico`          | `Crotalic`          | Snake (cascavel)       |
| `Elapídico`          | `Elapidic`          | Snake (coral)          |
| `Laquético`          | `Lachetic`          | Snake (surucucu)       |
| `Escorpiônico`       | `Scorpionic`        | Scorpion               |
| `Loxoscélico`        | `Loxoscelic`        | Spider (brown recluse) |
| `Foneutrico`         | `Phoneutric`        | Spider (armed)         |
| `Lonômico`           | `Lonomic`           | Caterpillar            |
| `Antiaracnídico`     | `Antiarachnidic`    | Spider (generic)       |

All derived from Latin/Greek roots — direct English cognates exist and are
used in international medical literature.

## 5.5 — API compatibility aliases

To avoid breaking any current consumer, query params accept both names for
a deprecation window (90 days). Server returns `Deprecation: true` and
`Sunset: <date>` headers when PT alias is used.

| EN (canonical) | PT alias (deprecated) |
| -------------- | --------------------- |
| `state_code`   | `uf`                  |
| `city`         | `municipio`, `cidade` |
| `treatment`    | `atendimento`         |
| `radius_m`     | `raio`                |

Animal aliases (already supported in current code) are kept as-is —
they map to canonical treatment types (jararaca → Bothropic, etc.).

## 6 — Things explicitly kept

- Repo name `hospitais-referencia-api`
- Folder names `api/`, `web/`, `sql/`, `scripts/` (already EN)
- Public URL paths: `/profissionais`, `/termos`, `/docs` (SEO + user-facing)
- All visible UI text in Portuguese
- File `api/index.js` (Vercel entry contract)
- Brazilian-specific terms: `cep`, `cnes`, `samu`
- Short coord names `lat`/`lng` in both code and DB

---

## 7 — Migration order (executed in Phase 0.2 onwards)

1. SQL migration `007_rename_to_english.sql` — pure `ALTER ... RENAME` (no data loss).
2. Python scripts (consume new schema).
3. Backend (consumes new schema + serves new API contract).
4. Frontend (consumes new API).
5. Workflow YAML.
6. Quality gates.
7. Validation + deploy.

Each layer is independently committable, but **deploy only after all layers pass validation** to avoid a window where API/web mismatch the DB.
