"""
Maps the XLSX "Tipo da Habilitação" (PT, free-ish text) to the canonical
specialty keys stored in hospital_specialties.

Canonical keys are EN snake_case, mirroring the DB/API convention. The
PT labels for display live in the web registry (web/lib/verticals.ts).

An unknown qualification type raises instead of being dropped: the sync
applies snapshots atomically, and silently losing a new establishment
category would be worse than a loud failed run.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Final

SPECIALTY_RARE_DISEASES_REFERENCE: Final = "rare_diseases_reference"
SPECIALTY_RARE_DISEASES_SPECIALIZED_CARE: Final = "rare_diseases_specialized_care"
SPECIALTY_GENE_THERAPY: Final = "gene_therapy"

# Normalized-substring -> canonical key. Checked in order; more than one
# may match (the source uses combined labels like "Serviço de Atenção
# Especializada em Doenças Raras e Serviço de Referência em Doenças Raras").
_SUBSTRING_TO_SPECIALTY: Final = (
    ("referencia em doencas raras", SPECIALTY_RARE_DISEASES_REFERENCE),
    ("atencao especializada em doencas raras", SPECIALTY_RARE_DISEASES_SPECIALIZED_CARE),
    ("terapia genica", SPECIALTY_GENE_THERAPY),
)


class UnknownQualificationTypeError(ValueError):
    """The XLSX introduced a qualification type this sync does not know."""


def map_qualification_type(raw: str) -> list[str]:
    """Returns the canonical specialties for a 'Tipo da Habilitação' cell.
    Order follows _SUBSTRING_TO_SPECIALTY; duplicates collapse."""
    normalized = _normalize(raw)
    matched = [key for needle, key in _SUBSTRING_TO_SPECIALTY if needle in normalized]
    if not matched:
        raise UnknownQualificationTypeError(
            f"Unknown qualification type: {raw!r}. "
            "Add it to scripts/syncs/rare_diseases/specialties.py."
        )
    # Dedupe preserving order (a combined label can hit the same key once).
    return list(dict.fromkeys(matched))


def _normalize(text: str) -> str:
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", stripped).strip().lower()
