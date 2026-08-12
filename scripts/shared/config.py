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
# The source page was taken down by the Ministry (redirects to the Plone
# login wall) — distinct from a fetch/parse failure so the daily probe can
# keep running without alarming anyone. See sql/026.
STATE_STATUS_SOURCE_UNPUBLISHED: Final[Literal["source_unpublished"]] = "source_unpublished"

# -------------------------------------------------------------------------
# Extraction source (column `hospitals.extraction_source`)
# -------------------------------------------------------------------------
EXTRACTION_SOURCE_PDF_TEXT: Final[Literal["pdf_text"]] = "pdf_text"
EXTRACTION_SOURCE_PDF_OCR: Final[Literal["pdf_ocr"]] = "pdf_ocr"
EXTRACTION_SOURCE_LLM_GEMINI: Final[Literal["llm_gemini"]] = "llm_gemini"
EXTRACTION_SOURCE_LLM_GROQ: Final[Literal["llm_groq"]] = "llm_groq"
EXTRACTION_SOURCE_XLSX: Final[Literal["xlsx"]] = "xlsx"
EXTRACTION_SOURCE_HTML: Final[Literal["html"]] = "html"
# Registro oficial estruturado (API DEMAS + serviços do site do CNES) — a
# única fonte que dispensa verificação humana por definição.
EXTRACTION_SOURCE_CNES_API: Final[Literal["cnes_api"]] = "cnes_api"

# -------------------------------------------------------------------------
# Vertical keys (column `hospitals.verticals`, `sync_logs.vertical`).
# Must stay in sync with the backend `Vertical` type (lib/types/domain.ts)
# and the web registry (web/lib/verticals.ts).
# -------------------------------------------------------------------------
VERTICAL_VENOMOUS_ANIMALS: Final[Literal["venomous_animals"]] = "venomous_animals"
VERTICAL_RARE_DISEASES: Final[Literal["rare_diseases"]] = "rare_diseases"
VERTICAL_ONCOLOGY: Final[Literal["oncology"]] = "oncology"
# Fase 2 do roadmap CNES-first. O sync Python já escreve as linhas; a
# exposição pública espera o wiring do backend/web (fase 2b).
VERTICAL_MENTAL_HEALTH: Final[Literal["mental_health"]] = "mental_health"
# Data-only vertical: ciatox_centers is its own table (not hospitals), so it
# does NOT join the backend `Vertical` union / KNOWN_VERTICALS — it exists
# here only as the vertical_sources / sync_logs discriminator.
VERTICAL_CIATOX: Final[Literal["ciatox"]] = "ciatox"

# The 27 UF codes (ISO 3166-2:BR). Parsers validate scraped state codes
# against this set before trusting them.
BRAZIL_STATE_CODES: Final[frozenset[str]] = frozenset(
    [
        "AC",
        "AL",
        "AM",
        "AP",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MG",
        "MS",
        "MT",
        "PA",
        "PB",
        "PE",
        "PI",
        "PR",
        "RJ",
        "RN",
        "RO",
        "RR",
        "RS",
        "SC",
        "SE",
        "SP",
        "TO",
    ]
)

# -------------------------------------------------------------------------
# Geocoding status (column `hospitals.geocoding_status`)
# -------------------------------------------------------------------------
GEOCODING_STATUS_OK = "ok"
GEOCODING_STATUS_PENDING = "pending"
GEOCODING_STATUS_FAILED = "failed"

# Coordinates supplied directly by the CNES open-data API (no geocoding ran).
GEOCODING_SOURCE_CNES_API = "cnes_api"

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
