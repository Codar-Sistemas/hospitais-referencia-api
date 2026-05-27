"""
Configuration: environment variables and project-wide constants.

Centralizes magic strings (status values, extraction sources, treatment
canonical names) so they are defined exactly once across the codebase.
"""

from __future__ import annotations

import os

USER_AGENT = (
    "hospitais-referencia-api-sync/1.0 "
    "(+https://github.com/Codar-Sistemas/hospitais-referencia-api)"
)
REQUEST_TIMEOUT = 30


def supabase_url() -> str | None:
    return os.environ.get("SUPABASE_URL")


def supabase_service_key() -> str | None:
    return os.environ.get("SUPABASE_SERVICE_KEY")


# -------------------------------------------------------------------------
# State sync status (column `states.status`)
# -------------------------------------------------------------------------
# Typed as Final[Literal[...]] so callsites that assign into a
# `SyncResult["status"]` keep the literal type intact.
from typing import Final, Literal  # noqa: E402  (groupped with the constants)

STATE_STATUS_OK: Final[Literal["ok"]] = "ok"
STATE_STATUS_OK_OCR: Final[Literal["ok_ocr"]] = "ok_ocr"
STATE_STATUS_ERROR: Final[Literal["error"]] = "error"
STATE_STATUS_UNSUPPORTED: Final[Literal["unsupported"]] = "unsupported"
STATE_STATUS_PENDING: Final[Literal["pending"]] = "pending"

# -------------------------------------------------------------------------
# Extraction source (column `hospitals.extraction_source`)
# -------------------------------------------------------------------------
EXTRACTION_SOURCE_PDF_TEXT = "pdf_text"
EXTRACTION_SOURCE_PDF_OCR = "pdf_ocr"

# -------------------------------------------------------------------------
# Geocoding status (column `hospitals.geocoding_status`)
# -------------------------------------------------------------------------
GEOCODING_STATUS_OK = "ok"
GEOCODING_STATUS_PENDING = "pending"
GEOCODING_STATUS_FAILED = "failed"

# -------------------------------------------------------------------------
# Canonical English treatment names (written to DB).
# Order is significant: it defines the canonical output ordering of
# `normalize_treatments`.
# -------------------------------------------------------------------------
TREATMENT_BOTHROPIC = "Bothropic"
TREATMENT_CROTALIC = "Crotalic"
TREATMENT_ELAPIDIC = "Elapidic"
TREATMENT_LACHETIC = "Lachetic"
TREATMENT_SCORPIONIC = "Scorpionic"
TREATMENT_LOXOSCELIC = "Loxoscelic"
TREATMENT_PHONEUTRIC = "Phoneutric"
TREATMENT_LONOMIC = "Lonomic"
TREATMENT_ANTIARACHNIDIC = "Antiarachnidic"

CANONICAL_TREATMENTS: list[str] = [
    TREATMENT_BOTHROPIC,
    TREATMENT_CROTALIC,
    TREATMENT_ELAPIDIC,
    TREATMENT_LACHETIC,
    TREATMENT_SCORPIONIC,
    TREATMENT_LOXOSCELIC,
    TREATMENT_PHONEUTRIC,
    TREATMENT_LONOMIC,
    TREATMENT_ANTIARACHNIDIC,
]
