"""
Maps the CGCAN 17.XX habilitação codes to canonical specialty keys.

A cell can carry several codes ("17.07, 17.08 e 17.09" — even a dot-less
variant); `extract_codes` pulls them all by regex. The specialty key is
the establishment's macro category (one hospital_specialties row per
category); fine-grained capabilities (radiotherapy, hematology, pediatric
oncology, …) live in the raw codes and are served by the API's `disease`
filter and the web badges.

Semantics confirmed against the April/2026 file:
  17.04 Serviço Isolado de Radioterapia
  17.06-17.11 UNACON (+Radioterapia/+Hematologia/+Pediátrica/exclusivas)
  17.12-17.13 CACON (+Pediátrica)
  17.14 Hospital Geral com Cirurgia Oncológica (complexo hospitalar)
  17.15 Serviço de Radioterapia de Complexo Hospitalar
  17.16 Serviço de Oncologia Clínica de Complexo Hospitalar
  17.22 Tratamentos Integrados Sincrônicos
  17.23 Reconstrução Mamária Pós-Mastectomia

An unknown code raises: snapshots apply atomically, and silently dropping
a new qualification category would be worse than a loud failed run.
"""

from __future__ import annotations

import re
from typing import Final

SPECIALTY_ISOLATED_RADIOTHERAPY: Final = "isolated_radiotherapy"
SPECIALTY_UNACON: Final = "unacon"
SPECIALTY_CACON: Final = "cacon"
SPECIALTY_ONCOLOGY_SURGERY: Final = "oncology_surgery"
SPECIALTY_RADIOTHERAPY_COMPLEX: Final = "radiotherapy_complex"
SPECIALTY_SYNCHRONOUS_TREATMENT: Final = "synchronous_treatment"
SPECIALTY_BREAST_RECONSTRUCTION: Final = "breast_reconstruction"

CODE_TO_SPECIALTY: Final[dict[str, str]] = {
    "17.04": SPECIALTY_ISOLATED_RADIOTHERAPY,
    "17.06": SPECIALTY_UNACON,
    "17.07": SPECIALTY_UNACON,
    "17.08": SPECIALTY_UNACON,
    "17.09": SPECIALTY_UNACON,
    "17.10": SPECIALTY_UNACON,
    "17.11": SPECIALTY_UNACON,
    "17.12": SPECIALTY_CACON,
    "17.13": SPECIALTY_CACON,
    "17.14": SPECIALTY_ONCOLOGY_SURGERY,
    "17.15": SPECIALTY_RADIOTHERAPY_COMPLEX,
    "17.16": SPECIALTY_RADIOTHERAPY_COMPLEX,
    "17.22": SPECIALTY_SYNCHRONOUS_TREATMENT,
    "17.23": SPECIALTY_BREAST_RECONSTRUCTION,
}

# Matches "17.07", "17. 07", and the occasional dot-less "1707".
_CODE_RE = re.compile(r"17[.\s]?\s?(\d{2})")


class UnknownQualificationCodeError(ValueError):
    """The source introduced a 17.XX code this sync does not know."""


def extract_codes(text: str | None) -> list[str]:
    """All canonical '17.XX' codes found in a cell, deduped in order."""
    if not text:
        return []
    return list(dict.fromkeys(f"17.{m.group(1)}" for m in _CODE_RE.finditer(text)))


def map_codes(codes: list[str]) -> list[str]:
    """Canonical specialty keys for a list of codes, deduped in order."""
    keys: list[str] = []
    for code in codes:
        key = CODE_TO_SPECIALTY.get(code)
        if key is None:
            raise UnknownQualificationCodeError(
                f"Unknown qualification code: {code!r}. "
                "Add it to scripts/syncs/oncology/specialties.py."
            )
        if key not in keys:
            keys.append(key)
    return keys
