"""Structural types for the CIATOX pipeline."""

from __future__ import annotations

from typing import TypedDict


class CiatoxCenterRecord(TypedDict):
    """One toxicology center parsed from the CIATOX page, upsert-ready.

    `emergency_phone` is the FIRST number of the "Telefone Emergência" line
    (display format); every other number — secondary emergency numbers, then
    the "Telefone:" list — lands in `phones`, deduplicated, order preserved.
    """

    state_code: str
    name: str
    emergency_phone: str | None
    phones: list[str]
