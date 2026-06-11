"""
Diff and upsert the national rare-diseases snapshot.

Matching is by CNES (zero-padded, present on 100% of source rows) instead
of the venomous (city, name, cnes) key — establishment names in the XLSX
diverge from the PDF formatting, but the CNES code is stable.

Ownership rules for rows shared with another vertical (same CNES already
synced by e.g. venomous_animals):
  - join:   append 'rare_diseases' to `verticals` + write specialties.
            Core fields (name/address/phones/treatments/extraction_source)
            are NOT touched — the other vertical's pipeline owns them, and
            overwriting would ping-pong values between nightly syncs.
  - leave:  strip 'rare_diseases' from `verticals` + delete this vertical's
            specialties. The row itself survives for the other vertical.
Rows exclusive to rare_diseases are inserted/updated/deleted normally.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from scripts.shared.config import (
    EXTRACTION_SOURCE_XLSX,
    GEOCODING_SOURCE_CNES_API,
    GEOCODING_STATUS_OK,
    GEOCODING_STATUS_PENDING,
    VERTICAL_RARE_DISEASES,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.syncs.rare_diseases.types import RareDiseaseHospital


def upsert_rare_disease_hospitals(
    client: SupabaseClient,
    hospitals: dict[str, RareDiseaseHospital],
) -> tuple[int, int, int]:
    """
    Returns (inserted, updated, removed). "Updated" counts both owned-row
    updates and joins into shared rows; "removed" counts deletes and leaves.
    """
    now = datetime.now(UTC).isoformat()

    # Rows currently tagged with this vertical (candidates for update/remove)
    current = client.select(
        "hospitals",
        verticals=f"cs.{{{VERTICAL_RARE_DISEASES}}}",
        select="id,cnes,city,name,address,verticals,lat,lng,geocoding_status",
    )
    current_by_cnes = {row["cnes"]: row for row in current if row.get("cnes")}

    # Rows from other verticals sharing a CNES with the snapshot (join targets)
    shared_by_cnes: dict[str, dict[str, Any]] = {}
    snapshot_cnes = [c for c in hospitals if c not in current_by_cnes]
    if snapshot_cnes:
        candidates = client.select(
            "hospitals",
            cnes=f"in.({','.join(snapshot_cnes)})",
            select="id,cnes,verticals",
        )
        for row in candidates:
            cnes = row.get("cnes")
            if cnes and cnes not in shared_by_cnes:
                shared_by_cnes[cnes] = row

    inserted = updated = removed = 0
    to_insert: list[dict[str, Any]] = []

    for cnes, hospital in hospitals.items():
        owned = current_by_cnes.get(cnes)
        if owned:
            payload: dict[str, Any] = {
                "state_code": hospital["state_code"],
                "city": hospital["city"],
                "name": hospital["name"],
                "address": hospital["address"],
                "phones": hospital["phones"],
                "extraction_source": EXTRACTION_SOURCE_XLSX,
                "updated_at": now,
            }
            payload.update(_geocoding_fields(hospital, existing=owned, now=now))
            client.update("hospitals", {"id": owned["id"]}, payload)
            updated += 1
            continue

        shared = shared_by_cnes.get(cnes)
        if shared:
            verticals = list(shared.get("verticals") or [])
            if VERTICAL_RARE_DISEASES not in verticals:
                client.update(
                    "hospitals",
                    {"id": shared["id"]},
                    {"verticals": [*verticals, VERTICAL_RARE_DISEASES], "updated_at": now},
                )
            updated += 1
            continue

        row = {
            "state_code": hospital["state_code"],
            "city": hospital["city"],
            "name": hospital["name"],
            "address": hospital["address"],
            "phones": hospital["phones"],
            "cnes": cnes,
            "treatments": [],
            "treatments_raw": None,
            "extraction_source": EXTRACTION_SOURCE_XLSX,
            "ocr_confidence": None,
            "verticals": [VERTICAL_RARE_DISEASES],
        }
        row.update(_geocoding_fields(hospital, existing=None, now=now))
        to_insert.append(row)
        inserted += 1

    if to_insert:
        client.upsert("hospitals", to_insert, on_conflict="id")

    # Establishments that left the snapshot.
    for cnes, row in current_by_cnes.items():
        if cnes in hospitals:
            continue
        other_verticals = [v for v in (row.get("verticals") or []) if v != VERTICAL_RARE_DISEASES]
        if other_verticals:
            client.update(
                "hospitals", {"id": row["id"]}, {"verticals": other_verticals, "updated_at": now}
            )
            client.delete(
                "hospital_specialties",
                hospital_id=f"eq.{row['id']}",
                vertical=f"eq.{VERTICAL_RARE_DISEASES}",
            )
        else:
            client.delete("hospitals", id=f"eq.{row['id']}")
        removed += 1

    _reconcile_specialties(client, hospitals, now=now)

    log(f"+{inserted} new, ~{updated} updated/joined, -{removed} removed", state_code="BR")
    return inserted, updated, removed


# ---------------------------------------------------------------------------
def _geocoding_fields(
    hospital: RareDiseaseHospital,
    existing: dict[str, Any] | None,
    now: str,
) -> dict[str, Any]:
    """CNES-API coordinates win (official registry); otherwise keep what the
    row already has, or enqueue for Nominatim when there is nothing yet."""
    if hospital["lat"] is not None and hospital["lng"] is not None:
        return {
            "lat": hospital["lat"],
            "lng": hospital["lng"],
            "geocoding_status": GEOCODING_STATUS_OK,
            "geocoding_source": GEOCODING_SOURCE_CNES_API,
            "geocoded_at": now,
        }
    if existing and existing.get("lat") is not None and existing.get("lng") is not None:
        return {}  # keep previously resolved coordinates
    return {
        "lat": None,
        "lng": None,
        "geocoding_status": GEOCODING_STATUS_PENDING,
        "geocoding_source": None,
        "geocoded_at": None,
    }


def _reconcile_specialties(
    client: SupabaseClient,
    hospitals: dict[str, RareDiseaseHospital],
    now: str,
) -> None:
    """Upsert the snapshot's specialties and delete stale ones, scoped to
    this vertical. Needs fresh ids — inserts above used return=minimal."""
    if not hospitals:
        return

    cnes_list = ",".join(hospitals)
    id_rows = client.select("hospitals", cnes=f"in.({cnes_list})", select="id,cnes,verticals")
    id_by_cnes = {
        row["cnes"]: row["id"]
        for row in id_rows
        if row.get("cnes") and VERTICAL_RARE_DISEASES in (row.get("verticals") or [])
    }

    desired: set[tuple[int, str]] = set()
    rows: list[dict[str, Any]] = []
    for cnes, hospital in hospitals.items():
        hospital_id = id_by_cnes.get(cnes)
        if hospital_id is None:
            log(f"specialty reconcile: no row found for CNES {cnes}", state_code="BR")
            continue
        for entry in hospital["specialties"]:
            desired.add((hospital_id, entry["specialty"]))
            rows.append(
                {
                    "hospital_id": hospital_id,
                    "vertical": VERTICAL_RARE_DISEASES,
                    "specialty": entry["specialty"],
                    "habilitado_em": entry["habilitado_em"],
                    "source_url": entry["source_url"],
                    "metadata": entry["metadata"],
                    "updated_at": now,
                }
            )

    if rows:
        client.upsert("hospital_specialties", rows, on_conflict="hospital_id,vertical,specialty")

    existing = client.select(
        "hospital_specialties",
        vertical=f"eq.{VERTICAL_RARE_DISEASES}",
        select="hospital_id,specialty",
    )
    for row in existing:
        key = (row["hospital_id"], row["specialty"])
        if key not in desired:
            client.delete(
                "hospital_specialties",
                hospital_id=f"eq.{row['hospital_id']}",
                vertical=f"eq.{VERTICAL_RARE_DISEASES}",
                specialty=f"eq.{row['specialty']}",
            )
