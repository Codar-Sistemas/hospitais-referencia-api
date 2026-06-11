"""
Structural types for the rare_diseases sync pipeline.

The upsert-ready shapes (SpecialtyEntry, hospital keyed by CNES) are
shared with other qualification-based verticals and live in
scripts/shared/types.py; the aliases below keep this vertical's public
names stable. Only the XLSX row shape is rare-diseases-specific.
"""

from __future__ import annotations

from typing import TypedDict

from scripts.shared.types import QualificationHospital, SpecialtyEntry

# Public aliases — RareDiseaseHospital predates the shared extraction.
RareDiseaseHospital = QualificationHospital

__all__ = ["RareDiseaseHospital", "RareDiseaseXlsxRow", "SpecialtyEntry"]


class RareDiseaseXlsxRow(TypedDict):
    """One establishment row parsed from a gov.br XLSX (continuation lines
    already folded into `qualification_codes`)."""

    state_code: str
    city: str
    region: str | None
    cnes: str  # zero-padded to 7 digits
    name: str
    qualification_type_raw: str
    qualification_year: int | None
    qualification_codes: list[str]
    source_url: str
