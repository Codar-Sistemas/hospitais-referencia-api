"""
Entry point for the sync pipeline.

Flow for each state:
  1. Fetch the gov.br state page.
  2. Read the "Atualizado em DD/MM/YYYY HHhMM" timestamp and the PDF URL.
  3. Compare against the `states` row:
        - If site timestamp is newer OR
        - If the PDF SHA-256 changed
     -> process. Otherwise skip.
  4. Download the PDF, parse it (text first, OCR fallback), upsert hospitals.
  5. Update the `states` row with the new timestamp, hash and total.

CLI usage:
  python -m scripts.syncs.venomous_animals                     # sync all states
  python -m scripts.syncs.venomous_animals SP                  # sync only SP
  python -m scripts.syncs.venomous_animals --force SP          # force re-sync
  python -m scripts.syncs.venomous_animals geocode             # geocode pending rows
  python -m scripts.syncs.venomous_animals geocode SP          # geocode pending rows in SP

Required environment variables:
  SUPABASE_URL          Supabase project URL
  SUPABASE_SERVICE_KEY  service_role key (NEVER the anon key here)
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from datetime import UTC, datetime
from typing import Any

from scripts.parsing.text_parser import parse_pdf
from scripts.shared.config import (
    EXTRACTION_SOURCE_PDF_OCR,
    EXTRACTION_SOURCE_PDF_TEXT,
    GEOCODING_STATUS_FAILED,
    GEOCODING_STATUS_OK,
    GEOCODING_STATUS_PENDING,
    STATE_STATUS_ERROR,
    STATE_STATUS_OK,
    STATE_STATUS_OK_OCR,
    STATE_STATUS_UNSUPPORTED,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.syncs.venomous_animals.change_detector import needs_update, pdf_hash_changed
from scripts.syncs.venomous_animals.scraper import (
    download_pdf,
    fetch_page_metadata,
    is_image_based_pdf,
)
from scripts.syncs.venomous_animals.upserter import upsert_hospitals


# ---------------------------------------------------------------------------
# Per-state sync
# ---------------------------------------------------------------------------
def sync_state(client: SupabaseClient, state_code: str, force: bool = False) -> dict[str, Any]:
    rows = client.select("states", state_code=f"eq.{state_code}", select="*")
    if not rows:
        return {
            "state_code": state_code,
            "status": "skipped",
            "reason": "state not registered",
        }
    state_row = rows[0]

    log(f"Checking {state_row['page_url']} ...", state_code=state_code)
    site_updated_at, pdf_url = fetch_page_metadata(state_row["page_url"])
    if not pdf_url:
        return {
            "state_code": state_code,
            "status": "error",
            "reason": "PDF not found on page",
        }

    should_process = needs_update(state_row, site_updated_at, force=force)
    content: bytes
    pdf_hash: str

    if not should_process:
        # Timestamp suggests no change — still verify by hash.
        content, pdf_hash = download_pdf(pdf_url)
        if pdf_hash_changed(state_row, pdf_hash):
            should_process = True
    else:
        content, pdf_hash = download_pdf(pdf_url)

    if not should_process:
        return {"state_code": state_code, "status": "unchanged", "pdf_hash": pdf_hash}

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(content)
        tmp_path = f.name

    extraction_source = EXTRACTION_SOURCE_PDF_TEXT
    ocr_confidence: int | None = None

    try:
        records = parse_pdf(tmp_path, state_code)

        # If text parsing returned nothing, check whether the PDF is image-
        # based (scanned). If so, try OCR as a fallback.
        if not records and is_image_based_pdf(tmp_path):
            try:
                from scripts.parsing.ocr_engine import is_ocr_available
                from scripts.parsing.ocr_parser import parse_pdf_ocr
            except ImportError as e:
                return {
                    "state_code": state_code,
                    "status": STATE_STATUS_UNSUPPORTED,
                    "reason": f"Scanned PDF, OCR unavailable: {e}",
                }

            if not is_ocr_available():
                return {
                    "state_code": state_code,
                    "status": STATE_STATUS_UNSUPPORTED,
                    "reason": (
                        "Scanned PDF, OCR unavailable (tesseract not installed in environment)"
                    ),
                }

            log("Scanned PDF detected — attempting OCR extraction ...", state_code=state_code)
            try:
                records, mean_confidence = parse_pdf_ocr(tmp_path, state_code)
            except Exception as e:
                return {
                    "state_code": state_code,
                    "status": "error",
                    "reason": f"OCR failed: {e}",
                }

            if not records:
                return {
                    "state_code": state_code,
                    "status": STATE_STATUS_UNSUPPORTED,
                    "reason": "Scanned PDF — OCR ran but extracted no records",
                }

            extraction_source = EXTRACTION_SOURCE_PDF_OCR
            ocr_confidence = round(mean_confidence)
            log(
                f"OCR extracted {len(records)} records (mean confidence: {mean_confidence:.1f}%)",
                state_code=state_code,
            )
    finally:
        os.unlink(tmp_path)

    if not records:
        return {
            "state_code": state_code,
            "status": "error",
            "reason": "No records extracted",
        }

    log(f"{len(records)} records in PDF — syncing ...", state_code=state_code)
    inserted, updated, removed = upsert_hospitals(
        client, state_code, records, extraction_source, ocr_confidence
    )

    client.update(
        "states",
        {"state_code": state_code},
        {
            "pdf_url": pdf_url,
            "updated_at": site_updated_at.isoformat() if site_updated_at else None,
            "synced_at": datetime.now(UTC).isoformat(),
            "pdf_hash": pdf_hash,
            "total_hospitals": len(records),
            "status": (
                STATE_STATUS_OK_OCR
                if extraction_source == EXTRACTION_SOURCE_PDF_OCR
                else STATE_STATUS_OK
            ),
            "last_error": None,
        },
    )

    return {
        "state_code": state_code,
        "status": "updated",
        "total": len(records),
        "extraction_source": extraction_source,
        "ocr_confidence": ocr_confidence,
        "inserted": inserted,
        "updated": updated,
        "removed": removed,
        "pdf_url": pdf_url,
        "pdf_hash": pdf_hash,
    }


def sync_state_safe(
    client: SupabaseClient,
    state_code: str,
    force: bool = False,
    triggered_by: str = "manual",
) -> dict[str, Any]:
    """Wrap sync_state, capture exceptions and persist them on the state row."""
    from scripts.syncs.venomous_animals.sync_log_writer import write_sync_log

    started_at = datetime.now(UTC)
    try:
        result = sync_state(client, state_code, force=force)
    except Exception as e:
        message = str(e)
        try:
            client.update(
                "states",
                {"state_code": state_code},
                {
                    "synced_at": datetime.now(UTC).isoformat(),
                    "status": (
                        STATE_STATUS_UNSUPPORTED if "XLSX" in message else STATE_STATUS_ERROR
                    ),
                    "last_error": message[:500],
                },
            )
        except Exception:
            pass  # never let the logging branch break the sync
        result = {"state_code": state_code, "status": "error", "reason": message}

    write_sync_log(
        client,
        state_code=state_code,
        started_at=started_at,
        result=result,
        triggered_by=triggered_by,
    )
    return result


# ---------------------------------------------------------------------------
# Geocoding of pending hospitals
# ---------------------------------------------------------------------------
def geocode_pending(
    client: SupabaseClient,
    state_code: str | None = None,
    limit: int = 1000,
) -> dict[str, Any]:
    """
    Geocode hospitals with status 'pending'.
    Nominatim caps at 1 req/s -> ~17 minutes for 1000 records.
    """
    from scripts.geocoding.runner import Geocoder

    filters = {
        "select": "id,state_code,city,name,address",
        "geocoding_status": f"eq.{GEOCODING_STATUS_PENDING}",
        "limit": str(limit),
    }
    if state_code:
        filters["state_code"] = f"eq.{state_code}"

    pending = client.select("hospitals", **filters)
    if not pending:
        return {"geocoded": 0, "failed": 0}

    log(f"Geocoding {len(pending)} hospitals ...")
    geocoder = Geocoder(
        supabase_url=client.url,
        supabase_key=client.key,
    )
    ok_count = failed_count = 0
    for i, hospital in enumerate(pending, 1):
        result = geocoder.geocode_address(
            hospital.get("address") or "",
            hospital["city"],
            hospital["state_code"],
        )
        now = datetime.now(UTC).isoformat()
        if result:
            client.update(
                "hospitals",
                {"id": hospital["id"]},
                {
                    "lat": result.lat,
                    "lng": result.lng,
                    "geocoding_status": GEOCODING_STATUS_OK,
                    "geocoding_source": result.source,
                    "geocoded_at": now,
                },
            )
            ok_count += 1
        else:
            client.update(
                "hospitals",
                {"id": hospital["id"]},
                {
                    "geocoding_status": GEOCODING_STATUS_FAILED,
                    "geocoded_at": now,
                },
            )
            failed_count += 1
        if i % 20 == 0:
            log(f"  {i}/{len(pending)} (ok={ok_count}, failed={failed_count})")

    log(f"Done: {ok_count} ok, {failed_count} failed")
    return {"geocoded": ok_count, "failed": failed_count}


# ---------------------------------------------------------------------------
# Main / CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Sync hospitals from gov.br/saude into Supabase.")
    subparsers = parser.add_subparsers(dest="command")

    sync_parser = subparsers.add_parser(
        "sync", help="Download PDFs and update DB (skips geocoding)"
    )
    sync_parser.add_argument("state_code", nargs="?", help="Specific state code (omit for all)")
    sync_parser.add_argument("--force", action="store_true")

    geocode_parser = subparsers.add_parser("geocode", help="Geocode pending hospitals")
    geocode_parser.add_argument("state_code", nargs="?", help="Specific state code (omit for all)")
    geocode_parser.add_argument("--limit", type=int, default=1000)

    # Legacy positional / flag at the top level so that
    # `python -m scripts.syncs.venomous_animals SP --force` still works.
    parser.add_argument("state_code_legacy", nargs="?", help=argparse.SUPPRESS)
    parser.add_argument("--force", action="store_true", help=argparse.SUPPRESS)

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
        state_code = getattr(args, "state_code", None)
        geocode_pending(client, state_code=state_code, limit=args.limit)
        return

    # command == sync
    state_code_arg = getattr(args, "state_code", None) or getattr(args, "state_code_legacy", None)
    force = getattr(args, "force", False)
    state_codes = (
        [state_code_arg]
        if state_code_arg
        else [row["state_code"] for row in client.select("states", select="state_code")]
    )

    # triggered_by tells sync_logs whether this was cron, manual, or forced.
    # GitHub Actions sets GITHUB_ACTIONS=true; --force outranks the default.
    triggered_by = (
        "force" if force else ("cron" if os.environ.get("GITHUB_ACTIONS") == "true" else "manual")
    )

    results = []
    for code in state_codes:
        result = sync_state_safe(client, code, force=force, triggered_by=triggered_by)
        log(f"  -> {result}")
        results.append(result)

    updated = sum(1 for r in results if r["status"] == "updated")
    unchanged = sum(1 for r in results if r["status"] == "unchanged")
    unsupported = sum(1 for r in results if r["status"] == STATE_STATUS_UNSUPPORTED)
    errors = sum(1 for r in results if r["status"] == "error")

    print(
        f"\nSummary: {updated} updated, {unchanged} unchanged, "
        f"{unsupported} unsupported, {errors} errors, {len(results)} total"
    )

    states_via_ocr = [r for r in results if r.get("extraction_source") == EXTRACTION_SOURCE_PDF_OCR]
    if states_via_ocr:
        print("States extracted via OCR: " + ", ".join(r["state_code"] for r in states_via_ocr))

    unsupported_states = [r for r in results if r["status"] == STATE_STATUS_UNSUPPORTED]
    if unsupported_states:
        print("Unsupported states (require manual review):")
        for r in unsupported_states:
            print(f"  - [{r['state_code']}] {r.get('reason', 'unknown reason')}")

    error_states = [r for r in results if r["status"] == "error"]
    if error_states:
        print("States with errors:")
        for r in error_states:
            print(f"  - [{r['state_code']}] {r.get('reason', 'unknown error')}")

    # Fail only when NO state was processed successfully. Partial
    # failures stay recorded in states.status / states.last_error.
    successes = updated + unchanged
    if successes == 0 and (errors > 0 or unsupported > 0):
        print("\nNo state processed successfully — failing the job.")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
