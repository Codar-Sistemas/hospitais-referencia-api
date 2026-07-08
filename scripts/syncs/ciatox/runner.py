"""
Entry point for the CIATOX sync pipeline.

National-source pattern (like rare_diseases): ONE page lists every UF's
toxicology centers at once, so change-detection state lives in
`vertical_sources` (vertical='ciatox') and each run logs a single
sync_logs row with the national sentinel state_code 'BR'. Flow:

  1. Read the page URL from `vertical_sources` (URL lives in data).
  2. Fetch the page. A redirect to the Plone login wall means the Ministry
     unpublished it → status 'source_unpublished', never a hard failure.
  3. Parse the accordion HTML into center records.
  4. Short-circuit when the PARSED records hash matches the stored hash —
     the raw HTML carries per-request tokens, so hashing it would re-upsert
     every day for nothing.
  5. Snapshot-upsert ciatox_centers; record state in vertical_sources.

CLI usage:
  python -m scripts.syncs.ciatox sync            # sync if changed
  python -m scripts.syncs.ciatox sync --force    # re-sync regardless

Required environment variables:
  SUPABASE_URL          Supabase project URL
  SUPABASE_SERVICE_KEY  service_role key (NEVER the anon key here)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from typing import Final

from scripts.shared.config import (
    EXTRACTION_SOURCE_HTML,
    REQUEST_TIMEOUT,
    STATE_STATUS_SOURCE_UNPUBLISHED,
    USER_AGENT,
    VERTICAL_CIATOX,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.http import build_session
from scripts.shared.logger import log
from scripts.shared.sync_log_writer import write_sync_log
from scripts.shared.types import SyncResult
from scripts.syncs.ciatox.parser import parse_ciatox_page
from scripts.syncs.ciatox.types import CiatoxCenterRecord
from scripts.syncs.ciatox.upserter import upsert_ciatox_centers

VERTICAL: Final = VERTICAL_CIATOX
# sync_logs.state_code sentinel for national-source syncs (see migration 015).
NATIONAL_STATE_CODE: Final = "BR"

# Plone login wall — where gov.br sends requests for unpublished content.
LOGIN_REDIRECT_MARKER: Final = "acl_users/credentials_cookie_auth/require_login"


def fetch_page(url: str) -> tuple[str, str]:
    """Returns (html, final_url). The caller inspects final_url for the
    login-wall marker — the wall answers 200, so status alone says nothing."""
    session = build_session()
    response = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT)
    final_url = str(response.url)
    if LOGIN_REDIRECT_MARKER not in final_url:
        response.raise_for_status()
    return response.text, final_url


def records_hash(records: list[CiatoxCenterRecord]) -> str:
    """Stable content hash over the PARSED snapshot (canonical JSON)."""
    canonical = json.dumps(records, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sync(client: SupabaseClient, force: bool = False) -> SyncResult:
    sources = client.select(
        "vertical_sources",
        vertical=f"eq.{VERTICAL}",
        source_key="eq.ciatox_page",
        select="source_key,url,file_hash",
    )
    if not sources:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "error",
            "reason": "vertical_sources has no rows for ciatox (run sql/025)",
        }
    source = sources[0]

    log(f"Fetching {source['url']} ...", state_code=NATIONAL_STATE_CODE)
    html, final_url = fetch_page(source["url"])
    if LOGIN_REDIRECT_MARKER in final_url:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": STATE_STATUS_SOURCE_UNPUBLISHED,
            "reason": f"CIATOX page redirects to login wall: {final_url}",
        }

    records = parse_ciatox_page(html)
    if not records:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "error",
            "reason": "CIATOX page parsed to zero centers — page restructured?",
        }

    snapshot_hash = records_hash(records)
    if not force and source.get("file_hash") == snapshot_hash:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "unchanged",
            "pdf_hash": snapshot_hash,
        }

    states_covered = {record["state_code"] for record in records}
    log(
        f"{len(records)} centers across {len(states_covered)} UFs — syncing ...",
        state_code=NATIONAL_STATE_CODE,
    )
    inserted, updated, removed = upsert_ciatox_centers(client, records, source["url"])

    now = datetime.now(UTC).isoformat()
    client.update(
        "vertical_sources",
        {"vertical": VERTICAL, "source_key": source["source_key"]},
        {
            "file_hash": snapshot_hash,
            "synced_at": now,
            "status": "ok",
            "last_error": None,
            "total_records": len(records),
            "updated_at": now,
        },
    )

    return {
        "state_code": NATIONAL_STATE_CODE,
        "status": "updated",
        "total": len(records),
        "extraction_source": EXTRACTION_SOURCE_HTML,
        "inserted": inserted,
        "updated": updated,
        "removed": removed,
        "pdf_url": source["url"],
        "pdf_hash": snapshot_hash,
    }


def sync_safe(
    client: SupabaseClient,
    force: bool = False,
    triggered_by: str = "manual",
) -> SyncResult:
    """Wrap sync, persist failures on vertical_sources and always log the run."""
    started_at = datetime.now(UTC)
    try:
        result = sync(client, force=force)
    except Exception as e:
        result = {"state_code": NATIONAL_STATE_CODE, "status": "error", "reason": str(e)}

    if result["status"] in ("error", STATE_STATUS_SOURCE_UNPUBLISHED):
        status = (
            STATE_STATUS_SOURCE_UNPUBLISHED
            if result["status"] == STATE_STATUS_SOURCE_UNPUBLISHED
            else "error"
        )
        try:
            client.update(
                "vertical_sources",
                {"vertical": VERTICAL, "source_key": "ciatox_page"},
                {
                    "status": status,
                    "last_error": (result.get("reason") or "")[:500],
                    "updated_at": datetime.now(UTC).isoformat(),
                },
            )
        except Exception:
            pass  # bookkeeping (or a pre-026 CHECK) must never mask the real outcome

    write_sync_log(
        client,
        state_code=NATIONAL_STATE_CODE,
        started_at=started_at,
        result=result,
        triggered_by=triggered_by,
        vertical=VERTICAL,
    )
    return result


# ---------------------------------------------------------------------------
# Main / CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync CIATOX toxicology centers from gov.br/saude into Supabase."
    )
    subparsers = parser.add_subparsers(dest="command")
    sync_parser = subparsers.add_parser("sync", help="Scrape the CIATOX page and update DB")
    sync_parser.add_argument("--force", action="store_true")

    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    rest_base = os.environ.get("SUPABASE_REST_URL")  # local PostgREST override
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(2)
    client = SupabaseClient(url, key, rest_base=rest_base)

    force = getattr(args, "force", False)
    triggered_by = (
        "force" if force else ("cron" if os.environ.get("GITHUB_ACTIONS") == "true" else "manual")
    )
    result = sync_safe(client, force=force, triggered_by=triggered_by)
    log(f"  -> {result}")

    if result["status"] == STATE_STATUS_SOURCE_UNPUBLISHED:
        # Keep probing daily without paging anyone — the run "succeeded":
        # it verified the source is still down.
        print(f"::warning title=CIATOX source unpublished::{result.get('reason', '')}")
        sys.exit(0)
    if result["status"] == "error":
        print(f"Sync failed: {result.get('reason', 'unknown error')}", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
