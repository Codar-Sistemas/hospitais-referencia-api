"""
Thin wrapper over the shared qualification upsert engine
(scripts/shared/qualification_sync.py), bound to this vertical.

The diff/ownership rules — match by CNES, join/leave shared rows without
touching core fields, vertical-scoped specialty reconcile — are
single-sourced there; keep this module a one-liner.
"""

from __future__ import annotations

from scripts.shared.config import VERTICAL_RARE_DISEASES
from scripts.shared.db import SupabaseClient
from scripts.shared.qualification_sync import upsert_qualification_hospitals
from scripts.syncs.rare_diseases.types import RareDiseaseHospital


def upsert_rare_disease_hospitals(
    client: SupabaseClient,
    hospitals: dict[str, RareDiseaseHospital],
) -> tuple[int, int, int]:
    """Returns (inserted, updated, removed)."""
    return upsert_qualification_hospitals(client, hospitals, vertical=VERTICAL_RARE_DISEASES)
