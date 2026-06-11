"""
Structural types for the oncology sync pipeline. The upsert-ready shapes
(SpecialtyEntry / QualificationHospital) are shared and live in
scripts/shared/types.py — only the parsed-row shape is oncology-specific.
"""

from __future__ import annotations

from typing import TypedDict


class OncologyRow(TypedDict):
    """One establishment row parsed from a CGCAN spreadsheet."""

    state_code: str
    city: str
    region: str | None
    cnes: str  # zero-padded to 7 digits
    name: str
    qualification_text_raw: str | None
    qualification_codes: list[str]  # canonical "17.XX" strings
    portaria: str | None
    source_key: str
    source_url: str
