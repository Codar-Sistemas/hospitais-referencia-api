"""
Structural types for the rare_diseases sync pipeline.

The national XLSX rows carry far fewer fields than the venomous PDFs
(no address/phones — those come from the CNES API at enrichment time),
so this vertical has its own shapes instead of reusing HospitalRecord.
"""

from __future__ import annotations

from typing import TypedDict


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


class SpecialtyEntry(TypedDict):
    """One (specialty, metadata) pair destined for hospital_specialties."""

    specialty: str
    habilitado_em: str | None  # ISO date (YYYY-01-01 — source has year only)
    source_url: str
    metadata: dict[str, object]


class RareDiseaseHospital(TypedDict):
    """Upsert-ready hospital, keyed by CNES, after merging both XLSX files
    and enriching with the CNES open-data API."""

    state_code: str
    city: str
    name: str
    cnes: str
    address: str | None
    phones: str | None
    lat: float | None
    lng: float | None
    specialties: list[SpecialtyEntry]
