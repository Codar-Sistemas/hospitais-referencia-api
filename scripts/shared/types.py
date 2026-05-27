"""
Shared structural types for the Python pipeline.

These TypedDicts replace `dict[str, Any]` everywhere the shape is
stable (parser outputs, DB row reads, sync results). `Any` stays only
on genuinely dynamic boundaries (table-agnostic Supabase client,
generic logger, backup manifest of N tables).
"""

from __future__ import annotations

from typing import Literal, TypedDict


class WordBox(TypedDict, total=False):
    """A single word extracted from a PDF page.

    `pdfplumber.extract_words()` and the Tesseract layer both emit this
    shape. `confidence` is OCR-only (text extraction has no notion of it).
    """

    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    confidence: float


class ParsedHospitalRow(TypedDict):
    """Intermediate output of a page parser, before state-level fields
    and canonical treatments are filled in by the orchestrator.

    All fields except `city` are nullable to reflect the reality of
    sparse PDF cells (some states publish rows without a CNES, etc).
    """

    city: str
    name: str | None
    address: str | None
    phones: str | None
    cnes: str | None
    treatments_raw: str | None


class HospitalRecord(ParsedHospitalRow):
    """Upsert-ready hospital row. Adds the state-level / canonical fields
    that `parse_pdf` (or the LLM extractor) attaches after the per-page
    parser is done.
    """

    state_code: str
    treatments: list[str]


SyncStatus = Literal[
    "ok",
    "ok_ocr",
    "ok_llm",
    "unchanged",
    "updated",
    "error",
    "skipped",
    "unsupported",
    "pending",
]


class StateRow(TypedDict, total=False):
    """A row from the `states` table.

    Most fields are NULL until the first successful sync, so `total=False`
    keeps the type honest. The sync pipeline writes the remaining fields
    over time.
    """

    state_code: str
    name: str
    page_url: str
    pdf_url: str
    pdf_hash: str
    updated_at: str
    synced_at: str
    total_hospitals: int
    status: SyncStatus
    last_error: str


class SyncResult(TypedDict, total=False):
    """Per-state outcome returned by `sync_state` and friends.

    `state_code` and `status` are always present; everything else depends
    on the branch the sync took (unchanged, OCR fallback, error, …).
    """

    state_code: str
    status: SyncStatus
    reason: str
    inserted: int
    updated: int
    removed: int
    deleted: int
    total: int
    pdf_url: str
    pdf_hash: str
    extraction_source: str
    ocr_confidence: int | None
    triggered_by: str


class GeocodingSummary(TypedDict):
    """Return of the geocoding batch entry-point."""

    geocoded: int
    failed: int


class BackupTableInfo(TypedDict, total=False):
    """One entry in the backup manifest, keyed by table name."""

    rows: int
    bytes: int
    sha256: str
    error: str


class BackupManifest(TypedDict):
    """Top-level shape of `backups/<timestamp>/manifest.json`."""

    timestamp: str
    supabase_url: str
    schema: Literal["en", "pt"]
    tables: dict[str, BackupTableInfo]


__all__ = [
    "BackupManifest",
    "BackupTableInfo",
    "GeocodingSummary",
    "HospitalRecord",
    "ParsedHospitalRow",
    "StateRow",
    "SyncResult",
    "SyncStatus",
    "WordBox",
]
