"""
CAPS subtype vocabulary: maps the free-text `dsStpUnidade` the CNES site
returns to the canonical specialty keys stored in `hospital_specialties`.

The descriptions mirror tbSubTipo of the monthly CNES base for unit type 70
(see docs/internal/CNES_INVENTORY.md). CAPS AD III municipal and regional
collapse into one key: the distinction is administrative, not what a person
in crisis needs to know.
"""

from __future__ import annotations

import re
import unicodedata

# Canonical specialty keys, in display order.
CAPS_SUBTYPE_KEYS = (
    "caps_i",
    "caps_ii",
    "caps_iii",
    "caps_ij",
    "caps_ad",
    "caps_ad_iii",
    "caps_ad_iv",
)

_SUBTYPE_BY_NORMALIZED = {
    "CAPS I": "caps_i",
    "CAPS II": "caps_ii",
    "CAPS III": "caps_iii",
    "CAPS INFANTO/JUVENIL": "caps_ij",
    "CAPS INFANTO JUVENIL": "caps_ij",
    "CAPS ALCOOL E DROGA": "caps_ad",
    "CAPS ALCOOL E DROGAS": "caps_ad",
    "CAPS ALCOOL E DROGAS III - MUNICIPAL": "caps_ad_iii",
    "CAPS ALCOOL E DROGAS III - REGIONAL": "caps_ad_iii",
    "CAPS AD III": "caps_ad_iii",
    "CAPS AD IV": "caps_ad_iv",
}


def resolve_caps_subtype(subtype_description: str | None) -> str | None:
    """None quando o site não informa subtipo ou o texto é desconhecido —
    o estabelecimento continua na vertical, apenas sem a especialidade."""
    if not subtype_description:
        return None
    return _SUBTYPE_BY_NORMALIZED.get(_normalize(subtype_description))


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().upper()
