"""
Entry point for the oncology sync pipeline.

National source: three CGCAN spreadsheets (CACON/UNACON + isolated
radiotherapy, breast reconstruction, synchronous treatment). Flow:

  1. Read the source registry from `vertical_sources`.
  2. Re-resolve the CURRENT file URLs from the CGCAN page (the main file's
     name is dated and changes monthly); refresh `vertical_sources.url`.
  3. Download all files; if no hash changed (and not --force), skip.
  4. Parse (dual-format: the main file is legacy .xls), group by CNES —
     one establishment can appear in all three files.
  5. Enrich address/phone/coordinates from the CNES open-data API.
  6. Diff + upsert hospitals and hospital_specialties (shared engine).
  7. Record per-file state and one sync_logs row (sentinel 'BR').

CLI usage:
  python -m scripts.syncs.oncology sync [--force]
  python -m scripts.syncs.oncology geocode [--limit N]

Required environment variables:
  SUPABASE_URL          Supabase project URL
  SUPABASE_SERVICE_KEY  service_role key (NEVER the anon key here)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import UTC, datetime
from typing import Any, Final

import requests

from scripts.geocoding.batch import geocode_pending
from scripts.shared.config import EXTRACTION_SOURCE_XLSX, VERTICAL_ONCOLOGY
from scripts.shared.db import SupabaseClient
from scripts.shared.http import download_file
from scripts.shared.logger import log
from scripts.shared.qualification_sync import (
    enrich_with_cnes,
    upsert_qualification_hospitals,
)
from scripts.shared.sync_log_writer import write_sync_log
from scripts.shared.types import QualificationHospital, SpecialtyEntry, SyncResult
from scripts.syncs.oncology.sources import SOURCE_PAGE_URL, resolve_source_urls
from scripts.syncs.oncology.specialties import map_codes
from scripts.syncs.oncology.types import OncologyRow
from scripts.syncs.oncology.xlsx_parser import parse_source

VERTICAL: Final = VERTICAL_ONCOLOGY
# sync_logs.state_code sentinel for national-source runs (see migration 015).
NATIONAL_STATE_CODE: Final = "BR"


# ---------------------------------------------------------------------------
# Snapshot assembly
# ---------------------------------------------------------------------------
def build_hospital_records(rows: list[OncologyRow]) -> dict[str, QualificationHospital]:
    """Group parsed rows by CNES; within a hospital, merge entries that map
    to the same macro specialty (union of codes/texts, first portaria)."""
    hospitals: dict[str, QualificationHospital] = {}
    for row in rows:
        hospital = hospitals.get(row["cnes"])
        if hospital is None:
            hospital = {
                "state_code": row["state_code"],
                "city": row["city"],
                "name": row["name"],
                "cnes": row["cnes"],
                "address": None,
                "phones": None,
                "lat": None,
                "lng": None,
                "specialties": [],
            }
            hospitals[row["cnes"]] = hospital

        for specialty_key in map_codes(row["qualification_codes"]):
            entry = _find_entry(hospital["specialties"], specialty_key)
            if entry is None:
                hospital["specialties"].append(
                    {
                        "specialty": specialty_key,
                        "habilitado_em": None,  # source has no reliable date
                        "source_url": row["source_url"],
                        "portaria": row["portaria"],
                        "metadata": {
                            "qualification_codes": list(row["qualification_codes"]),
                            "qualification_types_raw": (
                                [row["qualification_text_raw"]]
                                if row["qualification_text_raw"]
                                else []
                            ),
                            "region": row["region"],
                            "source_keys": [row["source_key"]],
                        },
                    }
                )
                continue
            _merge_entry(entry, row)
    return hospitals


def _find_entry(entries: list[SpecialtyEntry], specialty: str) -> SpecialtyEntry | None:
    for entry in entries:
        if entry["specialty"] == specialty:
            return entry
    return None


def _merge_entry(entry: SpecialtyEntry, row: OncologyRow) -> None:
    metadata = entry["metadata"]
    codes = metadata.get("qualification_codes")
    if isinstance(codes, list):
        for code in row["qualification_codes"]:
            if code not in codes:
                codes.append(code)
    texts = metadata.get("qualification_types_raw")
    text_raw = row["qualification_text_raw"]
    if isinstance(texts, list) and text_raw and text_raw not in texts:
        texts.append(text_raw)
    keys = metadata.get("source_keys")
    if isinstance(keys, list) and row["source_key"] not in keys:
        keys.append(row["source_key"])
    if entry.get("portaria") is None and row["portaria"]:
        entry["portaria"] = row["portaria"]


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------
def sync(client: SupabaseClient, force: bool = False) -> SyncResult:
    sources = client.select(
        "vertical_sources",
        vertical=f"eq.{VERTICAL}",
        select="source_key,url,file_hash",
        order="source_key",
    )
    if not sources:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "error",
            "reason": "vertical_sources has no rows for oncology (run sql/016)",
        }

    _refresh_source_urls(client, sources)

    downloads: list[tuple[dict[str, Any], bytes, str]] = []
    for source in sources:
        log(f"Downloading {source['source_key']} ...", state_code="BR")
        content, file_hash = download_file(source["url"])
        downloads.append((source, content, file_hash))

    combined_hash = hashlib.sha256(
        "".join(file_hash for _, _, file_hash in downloads).encode()
    ).hexdigest()

    if not force and all(src.get("file_hash") == file_hash for src, _, file_hash in downloads):
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "unchanged",
            "pdf_hash": combined_hash,
        }

    rows: list[OncologyRow] = []
    for source, content, _ in downloads:
        parsed = parse_source(content, source["source_key"], source["url"])
        log(f"{source['source_key']}: {len(parsed)} establishments", state_code="BR")
        rows.extend(parsed)

    hospitals = build_hospital_records(rows)
    if not hospitals:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "error",
            "reason": "Spreadsheet parsing produced zero establishments",
        }

    enrich_with_cnes(hospitals)
    inserted, updated, removed = upsert_qualification_hospitals(
        client, hospitals, vertical=VERTICAL
    )

    now = datetime.now(UTC).isoformat()
    per_source_totals: dict[str, int] = {}
    for row in rows:
        per_source_totals[row["source_key"]] = per_source_totals.get(row["source_key"], 0) + 1
    for source, _, file_hash in downloads:
        client.update(
            "vertical_sources",
            {"vertical": VERTICAL, "source_key": source["source_key"]},
            {
                "file_hash": file_hash,
                "synced_at": now,
                "status": "ok",
                "last_error": None,
                "total_records": per_source_totals.get(source["source_key"], 0),
                "updated_at": now,
            },
        )

    return {
        "state_code": NATIONAL_STATE_CODE,
        "status": "updated",
        "total": len(hospitals),
        "extraction_source": EXTRACTION_SOURCE_XLSX,
        "inserted": inserted,
        "updated": updated,
        "removed": removed,
        "pdf_url": SOURCE_PAGE_URL,
        "pdf_hash": combined_hash,
    }


def _refresh_source_urls(client: SupabaseClient, sources: list[dict[str, Any]]) -> None:
    """Re-resolve file URLs from the CGCAN page (the main one is dated).
    Page unreachable -> keep stored URLs (the download below will surface a
    rotten one); page restructured -> SourceResolutionError propagates."""
    try:
        resolved = resolve_source_urls()
    except requests.RequestException as e:
        log(f"CGCAN page unreachable, using stored URLs: {e}", state_code="BR")
        return
    now = datetime.now(UTC).isoformat()
    for source in sources:
        current = resolved.get(source["source_key"])
        if current and current != source["url"]:
            log(f"{source['source_key']}: URL changed -> {current}", state_code="BR")
            client.update(
                "vertical_sources",
                {"vertical": VERTICAL, "source_key": source["source_key"]},
                {"url": current, "updated_at": now},
            )
            source["url"] = current


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
        message = str(e)
        try:
            client.update(
                "vertical_sources",
                {"vertical": VERTICAL},
                {
                    "status": "error",
                    "last_error": message[:500],
                    "updated_at": datetime.now(UTC).isoformat(),
                },
            )
        except Exception:
            pass  # never let the bookkeeping branch mask the real failure
        result = {"state_code": NATIONAL_STATE_CODE, "status": "error", "reason": message}

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
        description="Sync oncology establishments from gov.br/saude into Supabase."
    )
    subparsers = parser.add_subparsers(dest="command")

    sync_parser = subparsers.add_parser("sync", help="Download spreadsheets and update DB")
    sync_parser.add_argument("--force", action="store_true")

    geocode_parser = subparsers.add_parser("geocode", help="Geocode pending oncology hospitals")
    geocode_parser.add_argument("--limit", type=int, default=1000)

    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    rest_base = os.environ.get("SUPABASE_REST_URL")  # local PostgREST override
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(2)
    client = SupabaseClient(url, key, rest_base=rest_base)

    command = args.command or "sync"

    if command == "geocode":
        geocode_pending(client, vertical=VERTICAL, limit=args.limit)
        return

    force = getattr(args, "force", False)
    triggered_by = (
        "force" if force else ("cron" if os.environ.get("GITHUB_ACTIONS") == "true" else "manual")
    )
    result = sync_safe(client, force=force, triggered_by=triggered_by)
    log(f"  -> {result}")

    if result["status"] == "error":
        print(f"Sync failed: {result.get('reason', 'unknown error')}", file=sys.stderr)
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
