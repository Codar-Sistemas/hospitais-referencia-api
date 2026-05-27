# Working in this repo

Any change goes through the same baseline. The pre-commit hook enforces
most of it locally; CI re-runs everything on PRs.

## Type-safety baseline

| Layer                       | Tool / config                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend Node (`api`, `lib`) | TypeScript `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noPropertyAccessFromIndexSignature` |
| Frontend (`web/`)           | Same set of flags as the backend                                                                                                                    |
| Python (`scripts`, `tests`) | `mypy --strict` (see `[tool.mypy]` in `pyproject.toml`). Tests get a per-module override that relaxes call-site strictness only.                    |
| SQL                         | Migrations are reviewed by hand; `psql -f` must succeed locally before merge.                                                                       |

`any` / `Any` is allowed only when bridging a truly untyped boundary
(parsed PDF/XLSX dicts, BeautifulSoup tag attributes). Add a one-line
comment explaining why. Everything else must be typed.

## Naming convention

| Item                       | Idiom                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| DB columns + vertical keys | English, snake_case (`venomous_animals`, `state_code`)                                        |
| Python modules / folders   | English, snake_case (`scripts/syncs/venomous_animals/`)                                       |
| TypeScript types / vars    | English, camelCase / PascalCase                                                               |
| URL paths                  | English, kebab-case (`/v1/venomous-animals/...`)                                              |
| User-facing strings        | Portuguese — keep the official MS programme name (`"Animais Peçonhentos"`, `"Doenças Raras"`) |

Treatment names follow the same split: stored in English (`Bothropic`,
`Crotalic`) so the API is i18n-ready; rendered in Portuguese
(`Botrópico`, `Crotálico`) via the frontend translation dictionary.

## Comments policy

Document **why**, not **what**. Drop a comment when:

- A decision is non-obvious to a reader six months from now (rate-limit
  fail-open, LGPD IP-hash, the `private` cache-control rationale).
- A real-world edge case warranted code that looks weird (the Itatiba
  street-not-in-OSM example in `geocoding-service.ts`).
- Three places must change together (e.g. `Vertical` ↔ `KNOWN_VERTICALS`
  ↔ `URL_TO_DB_VERTICAL`).

Don't add a comment that just restates the function name or parameters.

## Quality gates

Run before pushing:

```
npm run check        # tsc + eslint + prettier + ruff + mypy
```

Pre-commit hook runs:

1. `lint-staged` (eslint --fix, prettier --write, ruff --fix on staged files)
2. `tsc --noEmit` for both backend and web (when _.ts/_.tsx is staged)
3. `mypy scripts/ tests/` (when \*.py is staged and `.venv/bin/python` exists)

CI runs the same checks on every PR (`.github/workflows/lint.yml`).

## Adding a new vertical

When you add a vertical (e.g. `transplants`), four places must change in
lockstep:

1. `lib/types/domain.ts` — append to the `Vertical` union
2. `lib/services/hospital-service.ts` — append to `KNOWN_VERTICALS`
3. `api/index.ts` — add the kebab↔snake mapping to `URL_TO_DB_VERTICAL`
4. `scripts/syncs/<name>/` — implement source/parser/upserter/runner

The display string ("Transplantes") goes in the frontend translation
map until the `vertical_sources` table (Phase 2.5.2) takes over.

## Local dev quickstart

```
supabase start                       # Postgres + PostgREST on :54322/:54321
psql ... -f sql/*.sql                # apply migrations in order
npm run dev                          # tsx + dev-server.ts on :3001
cd web && npm run dev                # Next.js on :3000
npx tsx scripts/seed-from-prod.ts    # populate local DB from prod API
```

Env vars: `.env.local` overrides `.env` and is loaded BEFORE any ESM
import by `node --env-file-if-exists` flags in the `dev` script.
