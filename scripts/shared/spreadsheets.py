"""
Layout-agnostic spreadsheet cell helpers shared by the qualification syncs
(rare_diseases, oncology). Layout-specific logic — header detection,
continuation rows, merged-cell forward-fill — stays in each vertical's
parser; only the pure cell normalizers live here so a fix lands once.
"""

from __future__ import annotations

import re
import unicodedata


class SheetLayoutError(RuntimeError):
    """The spreadsheet no longer matches the layout a parser expects.
    Raised loudly so a silent gov.br format change never half-applies."""


def clean_cell(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_header(value: object) -> str | None:
    """Lowercase, accent-stripped, whitespace-collapsed header cell —
    cosmetic header edits in a future upload don't break column mapping."""
    text = clean_cell(value)
    if text is None:
        return None
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", stripped).strip().lower()


def normalize_cnes(value: object, source_url: str) -> str:
    """CNES is 7 digits by spec; spreadsheets deliver it as int, float
    (2001586.0), or string with/without leading zeros."""
    if value is None:
        raise SheetLayoutError(f"Establishment row without CNES in {source_url}")
    if isinstance(value, float):
        value = int(value)
    digits = re.sub(r"\D", "", str(value))
    if not digits or len(digits) > 7:
        raise SheetLayoutError(f"Invalid CNES {value!r} in {source_url}")
    return digits.zfill(7)
