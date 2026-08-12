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
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from scripts.shared.llm_extractor import ExtractionOutcome

from scripts.geocoding.batch import geocode_pending
from scripts.parsing.text_parser import parse_pdf
from scripts.shared.config import (
    EXTRACTION_SOURCE_PDF_OCR,
    EXTRACTION_SOURCE_PDF_TEXT,
    STATE_STATUS_ERROR,
    STATE_STATUS_OK,
    STATE_STATUS_OK_OCR,
    STATE_STATUS_SOURCE_UNPUBLISHED,
    STATE_STATUS_UNSUPPORTED,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.shared.types import HospitalRecord, StateRow, SyncResult
from scripts.syncs.venomous_animals.change_detector import needs_update, pdf_hash_changed
from scripts.syncs.venomous_animals.scraper import (
    SourceUnpublishedError,
    download_pdf,
    fetch_page_metadata,
    is_image_based_pdf,
)
from scripts.syncs.venomous_animals.upserter import upsert_hospitals


# ---------------------------------------------------------------------------
# Image-based PDF extraction — LLM first, Tesseract as last resort
# ---------------------------------------------------------------------------
def _try_llm_extraction(pdf_path: str, state_code: str) -> ExtractionOutcome | None:
    """Run the vision-LLM fallback chain. Returns None when no provider
    is configured or every provider failed — caller falls back to OCR."""
    try:
        from scripts.shared.llm_extractor import (
            AllProvidersFailedError,
            extract_venomous_animals_pdf,
        )
    except ImportError as e:
        log(f"LLM extractor unavailable: {e}", state_code=state_code)
        return None

    log("Trying LLM extraction (Gemini → Groq) ...", state_code=state_code)
    try:
        return extract_venomous_animals_pdf(pdf_path, state_code)
    except AllProvidersFailedError as e:
        log(f"LLM extraction skipped: {e}", state_code=state_code)
        return None


def _try_ocr_extraction(
    pdf_path: str,
    state_code: str,
) -> tuple[list[HospitalRecord], float] | SyncResult:
    """Tesseract fallback. Returns a SyncResult dict on terminal errors
    (OCR unavailable / no records) so the caller can short-circuit."""
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
            "reason": "Scanned PDF, OCR unavailable (tesseract not installed)",
        }

    log("Falling back to Tesseract OCR ...", state_code=state_code)
    try:
        records, mean_confidence = parse_pdf_ocr(pdf_path, state_code)
    except Exception as e:
        return {"state_code": state_code, "status": "error", "reason": f"OCR failed: {e}"}

    if not records:
        return {
            "state_code": state_code,
            "status": STATE_STATUS_UNSUPPORTED,
            "reason": "Scanned PDF — OCR ran but extracted no records",
        }

    log(
        f"OCR extracted {len(records)} records (mean confidence: {mean_confidence:.1f}%)",
        state_code=state_code,
    )
    return records, mean_confidence


# ---------------------------------------------------------------------------
# Per-state sync
# ---------------------------------------------------------------------------
def sync_state(client: SupabaseClient, state_code: str, force: bool = False) -> SyncResult:
    rows = client.select("states", state_code=f"eq.{state_code}", select="*")
    if not rows:
        return {
            "state_code": state_code,
            "status": "skipped",
            "reason": "state not registered",
        }
    # Narrow the dynamic Supabase row to the typed `StateRow` shape — we own
    # the `states` schema, so a mismatch here is a real bug worth catching.
    state_row: StateRow = rows[0]  # type: ignore[assignment]

    log(f"Checking {state_row['page_url']} ...", state_code=state_code)
    try:
        site_updated_at, pdf_url = fetch_page_metadata(state_row["page_url"])
    except SourceUnpublishedError as e:
        # The Ministry took the page down (July 2026 incident). Keep the
        # last-synced hospitals untouched and let the daily probe detect
        # the republication on its own.
        return {
            "state_code": state_code,
            "status": STATE_STATUS_SOURCE_UNPUBLISHED,
            "reason": str(e),
        }
    # Reaching this line means the page answered — if the previous run had it
    # behind the login wall, this is the republication transition the July
    # 2026 incident taught us to announce out loud (it ends as silently as it
    # starts). Carried on every outcome below.
    republished = state_row.get("status") == STATE_STATUS_SOURCE_UNPUBLISHED

    if not pdf_url:
        return {
            "state_code": state_code,
            "status": "error",
            "reason": "PDF not found on page",
            "republished": republished,
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
        return {
            "state_code": state_code,
            "status": "unchanged",
            "pdf_hash": pdf_hash,
            "republished": republished,
        }

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(content)
        tmp_path = f.name

    extraction_source: str = EXTRACTION_SOURCE_PDF_TEXT
    ocr_confidence: int | None = None

    try:
        records = parse_pdf(tmp_path, state_code)

        # Empty result from text extraction + image-based PDF means we
        # need a vision-aware extractor. Try LLM providers first (higher
        # accuracy on tables); fall back to Tesseract only if every LLM
        # provider fails or no API key is configured.
        if not records and is_image_based_pdf(tmp_path):
            llm_outcome = _try_llm_extraction(tmp_path, state_code)
            if llm_outcome is not None:
                records = llm_outcome.records
                extraction_source = llm_outcome.provider
                # Reuse the existing `ocr_confidence` column for the LLM
                # heuristic score (0-100, same scale as Tesseract). Drives
                # the `requires_verification` generated column.
                ocr_confidence = llm_outcome.confidence
            else:
                ocr_outcome = _try_ocr_extraction(tmp_path, state_code)
                if isinstance(ocr_outcome, dict):
                    # short-circuit error / unsupported
                    return {**ocr_outcome, "republished": republished}
                records, mean_confidence = ocr_outcome
                extraction_source = EXTRACTION_SOURCE_PDF_OCR
                ocr_confidence = round(mean_confidence)
    finally:
        os.unlink(tmp_path)

    if not records:
        return {
            "state_code": state_code,
            "status": "error",
            "reason": "No records extracted",
            "republished": republished,
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
            # Anything that didn't come from deterministic text extraction
            # (OCR, Gemini, Groq) wears the "manual verification" badge.
            "status": (
                STATE_STATUS_OK
                if extraction_source == EXTRACTION_SOURCE_PDF_TEXT
                else STATE_STATUS_OK_OCR
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
        "republished": republished,
    }


def sync_state_safe(
    client: SupabaseClient,
    state_code: str,
    force: bool = False,
    triggered_by: str = "manual",
) -> SyncResult:
    """Wrap sync_state, capture exceptions and persist them on the state row."""
    from scripts.shared.sync_log_writer import write_sync_log

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

    if result["status"] == STATE_STATUS_SOURCE_UNPUBLISHED:
        try:
            client.update(
                "states",
                {"state_code": state_code},
                {
                    "synced_at": datetime.now(UTC).isoformat(),
                    "status": STATE_STATUS_SOURCE_UNPUBLISHED,
                    "last_error": (result.get("reason") or "")[:500],
                },
            )
        except Exception:
            pass  # pre-026 DBs reject the status value — keep probing anyway

    write_sync_log(
        client,
        state_code=state_code,
        started_at=started_at,
        result=result,
        triggered_by=triggered_by,
    )
    return result


# ---------------------------------------------------------------------------
# Main / CLI
# ---------------------------------------------------------------------------
# Geocoding moved to scripts/geocoding/batch.py (shared across verticals);
# `geocode_pending` is re-imported above so the CLI surface is unchanged.
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
    unpublished = sum(1 for r in results if r["status"] == STATE_STATUS_SOURCE_UNPUBLISHED)

    print(
        f"\nSummary: {updated} updated, {unchanged} unchanged, "
        f"{unsupported} unsupported, {unpublished} source-unpublished, "
        f"{errors} errors, {len(results)} total"
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

    unpublished_states = [r for r in results if r["status"] == STATE_STATUS_SOURCE_UNPUBLISHED]
    if unpublished_states:
        codes = ", ".join(r["state_code"] for r in unpublished_states)
        print(f"States with source unpublished by the Ministry: {codes}")
        _emit_unpublished_warning(unpublished_states, total=len(results))

    republished_states = [r for r in results if r.get("republished")]
    if republished_states:
        codes = ", ".join(r["state_code"] for r in republished_states)
        print(f"States republished by the Ministry (source is back): {codes}")
        _emit_republished_notice(republished_states)

    # Fail only when NO state was processed successfully AND at least one
    # had a REAL failure. "Source unpublished" is not a failure: the run did
    # its job by probing — when the Ministry republishes, the next daily run
    # resumes syncing on its own. Mixed outcomes sync whatever is available.
    successes = updated + unchanged
    if successes == 0 and (errors > 0 or unsupported > 0):
        print("\nNo state processed successfully — failing the job.")
        sys.exit(1)
    if successes == 0 and unpublished > 0:
        print("\nEvery reachable state is unpublished at the source — exiting with a warning.")
    sys.exit(0)


def _emit_republished_notice(republished_states: list[SyncResult]) -> None:
    """Counterpart of `_emit_unpublished_warning`: the July 2026 incident
    taught us the source comes back as silently as it vanishes — without this
    notice, nobody would know the freeze ended."""
    codes = ", ".join(r["state_code"] for r in republished_states)
    print(
        f"::notice title=Venomous source republished::{codes}: state pages are reachable "
        f"again after the gov.br login wall. The sync resumed automatically on this run."
    )

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    try:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(
                "### Fonte REPUBLICADA pelo Ministério da Saúde\n\n"
                "As páginas estaduais de animais peçonhentos voltaram a responder e a "
                "sincronização retomou automaticamente nesta execução.\n\n"
                f"Estados: {codes}\n"
            )
    except OSError:
        pass  # the summary is cosmetic — never fail the run over it


def _emit_unpublished_warning(unpublished_states: list[SyncResult], total: int) -> None:
    """GitHub Actions annotation + step summary so an all-unpublished run is
    visible on the workflow page without turning it red."""
    count = len(unpublished_states)
    scope = "ALL" if count == total else f"{count}/{total}"
    print(
        f"::warning title=Venomous source unpublished::{scope} state pages redirect to the "
        f"gov.br login wall (require_login). Last-synced hospitals remain served; the daily "
        f"probe keeps checking for republication."
    )

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    try:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write(
                f"### Fonte despublicada pelo Ministério da Saúde\n\n"
                f"{scope} páginas estaduais redirecionam para a tela de login do Plone "
                f"(`acl_users/credentials_cookie_auth/require_login`).\n\n"
                f"- Os hospitais da última sincronização continuam sendo servidos pela API.\n"
                f"- A sondagem diária segue ativa e volta a sincronizar sozinha quando o MS "
                f"republicar.\n\n"
                f"Estados: {', '.join(r['state_code'] for r in unpublished_states)}\n"
            )
    except OSError:
        pass  # the summary is cosmetic — never fail the run over it


if __name__ == "__main__":
    main()
