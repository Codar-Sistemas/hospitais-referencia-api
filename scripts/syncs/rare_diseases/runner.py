"""
Entry point for the rare_diseases sync pipeline.

Unlike venomous_animals (27 per-state PDFs), this vertical has a NATIONAL
source: two XLSX files listing every qualified establishment. Flow:

  1. Read the source registry from `vertical_sources` (URLs live in data).
  2. Download both files; if neither hash changed (and not --force), skip.
  3. Parse the XLSX rows, group by CNES (one establishment can appear in
     both files), map qualification types to canonical specialties.
  4. Enrich address/phone/coordinates from the CNES open-data API.
  5. Diff + upsert hospitals and hospital_specialties.
  6. Record per-file state in vertical_sources and one sync_logs row with
     the national sentinel state_code 'BR'.

CLI usage:
  python -m scripts.syncs.rare_diseases sync            # sync if changed
  python -m scripts.syncs.rare_diseases sync --force    # re-sync regardless
  python -m scripts.syncs.rare_diseases geocode         # Nominatim leftovers

Required environment variables:
  SUPABASE_URL          Supabase project URL
  SUPABASE_SERVICE_KEY  service_role key (NEVER the anon key here)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import UTC, date, datetime
from typing import Any, Final

from scripts.geocoding.batch import geocode_pending
from scripts.providers.cnes_api import CnesApiProvider
from scripts.shared.config import (
    EXTRACTION_SOURCE_XLSX,
    VERTICAL_RARE_DISEASES,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.http import download_file
from scripts.shared.logger import log
from scripts.shared.sync_log_writer import write_sync_log
from scripts.shared.types import SyncResult
from scripts.syncs.rare_diseases.specialties import map_qualification_type
from scripts.syncs.rare_diseases.types import (
    RareDiseaseHospital,
    RareDiseaseXlsxRow,
    SpecialtyEntry,
)
from scripts.syncs.rare_diseases.upserter import upsert_rare_disease_hospitals
from scripts.syncs.rare_diseases.xlsx_parser import parse_xlsx

VERTICAL: Final = VERTICAL_RARE_DISEASES
# sync_logs.state_code sentinel for national-source runs (see migration 015).
NATIONAL_STATE_CODE: Final = "BR"
SOURCE_PAGE_URL: Final = (
    "https://www.gov.br/saude/pt-br/composicao/saes/doencas-raras/"
    "politica-de-saude/estabelecimentos-habilitados"
)


# ---------------------------------------------------------------------------
# Snapshot assembly
# ---------------------------------------------------------------------------
def build_hospital_records(rows: list[RareDiseaseXlsxRow]) -> dict[str, RareDiseaseHospital]:
    """Group parsed rows by CNES — the same establishment can appear in both
    files (e.g. SRDR + gene therapy) and must merge into one hospital."""
    hospitals: dict[str, RareDiseaseHospital] = {}
    for row in rows:
        specialties = _specialty_entries(row)
        existing = hospitals.get(row["cnes"])
        if existing is None:
            hospitals[row["cnes"]] = {
                "state_code": row["state_code"],
                "city": row["city"],
                "name": row["name"],
                "cnes": row["cnes"],
                "address": None,
                "phones": None,
                "lat": None,
                "lng": None,
                "specialties": specialties,
            }
            continue
        known = {entry["specialty"] for entry in existing["specialties"]}
        existing["specialties"].extend(
            entry for entry in specialties if entry["specialty"] not in known
        )
    return hospitals


def _specialty_entries(row: RareDiseaseXlsxRow) -> list[SpecialtyEntry]:
    year = row["qualification_year"]
    habilitado_em = date(year, 1, 1).isoformat() if year else None
    metadata: dict[str, object] = {
        "qualification_type_raw": row["qualification_type_raw"],
        "qualification_codes": row["qualification_codes"],
        "qualification_year": year,
        "region": row["region"],
    }
    return [
        {
            "specialty": specialty,
            "habilitado_em": habilitado_em,
            "source_url": row["source_url"],
            "metadata": metadata,
        }
        for specialty in map_qualification_type(row["qualification_type_raw"])
    ]


def enrich_with_cnes(
    hospitals: dict[str, RareDiseaseHospital],
    provider: CnesApiProvider | None = None,
) -> None:
    """Fill address/phone/coordinates from the CNES open-data API.
    Per-CNES failures are tolerated — the row simply stays 'pending' and the
    Nominatim batch resolves it by city later."""
    provider = provider or CnesApiProvider()
    misses = 0
    for cnes, hospital in hospitals.items():
        establishment = provider.fetch(cnes)
        if establishment is None:
            misses += 1
            log(f"CNES API miss for {cnes} ({hospital['name']})", state_code="BR")
            continue
        hospital["address"] = establishment.address
        hospital["phones"] = establishment.phone
        hospital["lat"] = establishment.lat
        hospital["lng"] = establishment.lng
    log(f"CNES enrichment: {len(hospitals) - misses}/{len(hospitals)} resolved", state_code="BR")


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
            "reason": "vertical_sources has no rows for rare_diseases (run sql/015)",
        }

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

    rows: list[RareDiseaseXlsxRow] = []
    for source, content, _ in downloads:
        parsed = parse_xlsx(content, source["url"])
        log(f"{source['source_key']}: {len(parsed)} establishments", state_code="BR")
        rows.extend(parsed)

    hospitals = build_hospital_records(rows)
    if not hospitals:
        return {
            "state_code": NATIONAL_STATE_CODE,
            "status": "error",
            "reason": "XLSX parsing produced zero establishments",
        }

    enrich_with_cnes(hospitals)
    inserted, updated, removed = upsert_rare_disease_hospitals(client, hospitals)

    now = datetime.now(UTC).isoformat()
    per_file_totals = _totals_by_source(rows)
    for source, _, file_hash in downloads:
        client.update(
            "vertical_sources",
            {"vertical": VERTICAL, "source_key": source["source_key"]},
            {
                "file_hash": file_hash,
                "synced_at": now,
                "status": "ok",
                "last_error": None,
                "total_records": per_file_totals.get(source["url"], 0),
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


def _totals_by_source(rows: list[RareDiseaseXlsxRow]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for row in rows:
        totals[row["source_url"]] = totals.get(row["source_url"], 0) + 1
    return totals


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
        description="Sync rare-diseases establishments from gov.br/saude into Supabase."
    )
    subparsers = parser.add_subparsers(dest="command")

    sync_parser = subparsers.add_parser("sync", help="Download XLSX files and update DB")
    sync_parser.add_argument("--force", action="store_true")

    geocode_parser = subparsers.add_parser(
        "geocode", help="Geocode pending rare-diseases hospitals"
    )
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
