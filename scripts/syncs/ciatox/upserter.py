"""
Snapshot upsert for ciatox_centers.

The page is small (a few dozen centers nationwide) and carries no stable
identifier, so the diff key is (state_code, name) — matching the UNIQUE
constraint from sql/025. Each run replaces the snapshot: upsert everything
parsed, delete rows that vanished from the page.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.syncs.ciatox.types import CiatoxCenterRecord


def upsert_ciatox_centers(
    client: SupabaseClient,
    records: list[CiatoxCenterRecord],
    source_url: str,
) -> tuple[int, int, int]:
    """Returns (inserted, updated, removed)."""
    existing = client.select("ciatox_centers", select="id,state_code,name")
    existing_keys = {(row["state_code"], row["name"]): row["id"] for row in existing}

    now = datetime.now(UTC).isoformat()
    rows: list[dict[str, Any]] = [
        {
            "state_code": record["state_code"],
            "name": record["name"],
            "emergency_phone": record["emergency_phone"],
            "phones": record["phones"],
            "source_url": source_url,
            "synced_at": now,
            "updated_at": now,
        }
        for record in records
    ]
    client.upsert("ciatox_centers", rows, on_conflict="state_code,name")

    new_keys = {(record["state_code"], record["name"]) for record in records}
    stale_ids = [id_ for key, id_ in existing_keys.items() if key not in new_keys]
    for id_ in stale_ids:
        client.delete("ciatox_centers", id=f"eq.{id_}")

    inserted = sum(1 for key in new_keys if key not in existing_keys)
    updated = len(records) - inserted
    log(f"+{inserted} new, ~{updated} updated, -{len(stale_ids)} removed", state_code="BR")
    return inserted, updated, len(stale_ids)
