"""
Confirmation policy: extracted row vs the official CNES registry entry.

Pure module (no I/O) so the rules that decide `cnes_confirmed` — the flag
that lowers `requires_verification` in the DB (sql/027) — are unit-testable
in isolation. Signals compared: phone and coordinates. A field missing on
either side contributes nothing: no match, no divergence. Confirmation
demands at least one match AND zero divergences — absence of contradiction
alone is not confirmation.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from scripts.providers.cnes_api import CnesEstablishment

# Two geocoders disagreeing by a few hundred meters is normal for large
# hospital campuses; beyond ~1.5 km they are probably not the same place.
COORDS_DIVERGENCE_THRESHOLD_M = 1500.0

# Below this the "number" is a fragment (extension, partial OCR) — not
# enough to claim a match or a contradiction.
_MIN_PHONE_DIGITS = 8


@dataclass
class ConfirmationOutcome:
    confirmed: bool
    matches: list[str]
    divergences: list[str]


def evaluate(
    *,
    phones: str | None,
    lat: float | None,
    lng: float | None,
    registry: CnesEstablishment,
) -> ConfirmationOutcome:
    matches: list[str] = []
    divergences: list[str] = []

    official_phone = _digits(registry.phone)
    extracted_phones = _digits(phones)
    if len(official_phone) >= _MIN_PHONE_DIGITS and len(extracted_phones) >= _MIN_PHONE_DIGITS:
        # Compare by the local number (last 8 digits): the extracted field
        # mixes area codes, several numbers and OCR punctuation in one string.
        (matches if official_phone[-8:] in extracted_phones else divergences).append("phone")

    if (
        lat is not None
        and lng is not None
        and registry.lat is not None
        and registry.lng is not None
    ):
        distance = _distance_m(lat, lng, registry.lat, registry.lng)
        (matches if distance <= COORDS_DIVERGENCE_THRESHOLD_M else divergences).append("coords")

    return ConfirmationOutcome(
        confirmed=bool(matches) and not divergences,
        matches=matches,
        divergences=divergences,
    )


def _digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * earth_radius_m * math.asin(math.sqrt(a))
