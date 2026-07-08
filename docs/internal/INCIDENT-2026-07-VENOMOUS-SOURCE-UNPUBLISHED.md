# Incident: Ministry of Health unpublished the venomous-animals source pages

**Date detected:** 2026-07-08 (sync failures began ~2026-07-05; confirmed unpublished 07–08/Jul/2026)
**Status:** source still unpublished as of 2026-07-08 · daily probe active
**Affected vertical:** venomous_animals (all 27 state pages)

## What happened

The daily `sync-hospitals` workflow (03:00 UTC) started failing for **every**
state with `PDF not found on page`. Investigation showed the Ministry of
Health removed the per-state "Hospitais de Referência" pages from the
venomous-animals section: all 27 URLs of the form

```
https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/<estado>
```

now redirect to the Plone login wall. Evidence captured 2026-07-08 (Piauí,
same behaviour on every sampled state):

```
GET https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia/piaui
→ 302 … → 200 https://www.gov.br/saude/acl_users/credentials_cookie_auth/require_login
      ?came_from=https%3A//www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/
      animais-peconhentos/hospitais-de-referencia/piaui
```

The login wall answers **200**, so only the final URL reveals the removal —
`raise_for_status()` never fires and the old scraper misread it as an HTML
page without a PDF link ("PDF not found").

Meanwhile, the official venomous-animals section replaced the per-state
hospital lists with a pointer to the **CIATOX** page — the national directory
of toxicology centers (Centros de Informação e Assistência Toxicológica),
one HTML list per UF with emergency phone numbers:

```
https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/ciatox
```

## Decisions

1. **Keep serving the last-synced hospital data.** The snapshots in the
   `hospitals` table remain the most recent official data ever published.
   Deleting or hiding them would leave users with nothing in an emergency
   vertical. The web now shows a discreet freshness badge (last sync date +
   "fonte oficial em reestruturação pelo Ministério da Saúde") so nobody
   mistakes the snapshot for live data.
2. **Classify the removal as its own sync status, not a failure.**
   `source_unpublished` (states.status, sync_logs.status,
   vertical_sources.status — sql/026). The daily workflow keeps probing all
   27 states; when the Ministry republishes, the very next run resumes
   syncing with no human action. An all-unpublished run ends green with a
   `::warning` annotation + step summary instead of a red failure that would
   train everyone to ignore the workflow.
3. **Capture the CIATOX directory as a new data vertical** (sql/025,
   `scripts/syncs/ciatox/`, workflow at 06:30 UTC, `GET /v1/ciatox[/:uf]`).
   In a venomous-accident emergency the official guidance is to _call first_
   — the web now renders a "Emergência? Ligue primeiro" card with the state
   CIATOX's emergency phone above the hospital results.

## Rollout requirements (manual)

Migrations are **not** applied automatically. Before the next deploy of this
branch, run against production (in order):

```
psql ... -f sql/025_ciatox_centers.sql            # ciatox_centers + vertical_sources seed
psql ... -f sql/026_source_unpublished_status.sql # extends the status CHECKs
```

Until 026 runs, the sync degrades gracefully: it cannot persist the new
status value (states update is wrapped, sync_logs is best-effort) but the run
itself still exits green. Until 025 runs, `sync-ciatox` exits with
"vertical_sources has no rows for ciatox" and `/v1/ciatox` 404s at the
PostgREST layer.

After the first `sync-ciatox` run, spot-check `GET /v1/ciatox/PI` against the
live page.

## Return-to-normal criteria

- `sync-hospitals` summary shows `0 source-unpublished` again, or
- the Ministry announces the restructured hospital pages, in which case the
  scraper likely needs a new URL seed in `states.page_url` (one-line SQL per
  state, no deploy).

Watch: the CIATOX page carries a `documentModified` of 2025-06-13 — it
predates the removal, so it is a long-standing page that was _promoted_, not
a temporary stopgap. The hospital lists may return in a different section or
format; keep the probe running rather than assuming the old URLs come back.
