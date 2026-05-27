"""
Writes one row per state per sync run into the sync_logs table.

Captures the operational details required for the public /stats dashboard:
how often gov.br fetches succeed, how often OCR fallback kicks in, and how
long each state's sync takes. Best-effort — never let logging block a sync.
"""

from __future__ import annotations

from datetime import UTC, datetime

from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.shared.types import SyncResult


def write_sync_log(
    client: SupabaseClient,
    *,
    state_code: str,
    started_at: datetime,
    result: SyncResult,
    triggered_by: str = "manual",
) -> None:
    """
    Persist a sync_log row reflecting the outcome of a single state's run.

    `result` is whatever sync_state / sync_state_safe returned. We normalize
    its loose shape into the strict sync_logs schema.
    """
    finished_at = datetime.now(UTC)
    duration_ms = int((finished_at - started_at).total_seconds() * 1000)

    status = _normalize_status(result.get("status"))
    reason = result.get("reason")

    row = {
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "state_code": state_code,
        "status": status,
        "extraction_source": result.get("extraction_source"),
        "records_inserted": result.get("inserted"),
        "records_updated": result.get("updated"),
        "records_deleted": result.get("removed"),
        "duration_ms": duration_ms,
        "error_type": _classify_error(status, reason),
        "error_message": (reason[:500] if reason else None),
        "pdf_url": result.get("pdf_url"),
        "pdf_hash": result.get("pdf_hash"),
        "triggered_by": triggered_by,
    }

    try:
        client.upsert("sync_logs", [row], on_conflict="id")
    except Exception as e:
        # Telemetry must never break the sync — just log and continue.
        log(f"sync_logs write failed: {e}", state_code=state_code)


def _normalize_status(raw: str | None) -> str:
    # The runner uses 'updated'/'unchanged'/'error'/'unsupported'/'skipped'.
    # The schema accepts: success/unchanged/unsupported/failed.
    if raw == "updated":
        return "success"
    if raw == "unchanged":
        return "unchanged"
    if raw == "unsupported":
        return "unsupported"
    if raw == "skipped":
        return "unsupported"
    return "failed"


def _classify_error(status: str, reason: str | None) -> str | None:
    if status == "failed":
        if not reason:
            return "unknown"
        text = reason.lower()
        if "timeout" in text or "timed out" in text:
            return "timeout"
        if "pdf" in text and "not found" in text:
            return "pdf_not_found"
        if "ocr" in text:
            return "ocr_failure"
        if "xlsx" in text:
            return "unsupported_format"
        return "parse_error"
    return None
