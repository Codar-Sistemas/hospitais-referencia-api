"""
Diff and upsert hospital records for a single state.

Preserves geocoding when possible:
  - Matched row, same address -> keep lat/lng + geocoding metadata.
  - Matched row, address changed -> invalidate coordinates (re-geocode).
  - Unmatched row in new PDF     -> insert with geocoding_status='pending'.
  - Existing row missing from PDF -> delete.
"""

from __future__ import annotations

from datetime import UTC, datetime

from scripts.shared.config import (
    EXTRACTION_SOURCE_PDF_OCR,
    GEOCODING_STATUS_PENDING,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log


def upsert_hospitals(
    client: SupabaseClient,
    state_code: str,
    records: list[dict],
    extraction_source: str,
    ocr_confidence: int | None,
) -> tuple[int, int, int]:
    """
    Returns (inserted, updated, removed).
    """
    existing = client.select(
        "hospitals",
        state_code=f"eq.{state_code}",
        select=("id,city,name,address,cnes,lat,lng,geocoding_status,geocoding_source,geocoded_at"),
    )
    by_key = {(h["city"] or "", h["name"] or "", h["cnes"] or ""): h for h in existing}

    seen_ids: set = set()
    to_insert: list[dict] = []
    to_update: list[tuple[int, dict]] = []

    for record in records:
        key = (record["city"] or "", record["name"] or "", record["cnes"] or "")
        match = by_key.get(key)
        if match:
            seen_ids.add(match["id"])
            address_equal = (match.get("address") or "") == (record.get("address") or "")
            payload = {
                "state_code": record["state_code"],
                "city": record["city"],
                "name": record["name"],
                "address": record["address"],
                "phones": record["phones"],
                "cnes": record["cnes"],
                "treatments": record["treatments"],
                "treatments_raw": record["treatments_raw"],
                "extraction_source": extraction_source,
                "ocr_confidence": ocr_confidence,
                "updated_at": datetime.now(UTC).isoformat(),
            }
            if not address_equal:
                # Address changed: invalidate coordinates so they get re-geocoded.
                payload.update(
                    {
                        "lat": None,
                        "lng": None,
                        "geocoding_status": GEOCODING_STATUS_PENDING,
                        "geocoding_source": None,
                        "geocoded_at": None,
                    }
                )
            to_update.append((match["id"], payload))
        else:
            to_insert.append(
                {
                    **record,
                    "extraction_source": extraction_source,
                    "ocr_confidence": ocr_confidence,
                    "geocoding_status": GEOCODING_STATUS_PENDING,
                }
            )

    # Hospitals that disappeared from the PDF.
    ids_to_remove = [
        h["id"]
        for h in existing
        if h["id"] not in seen_ids and h["id"] not in {u[0] for u in to_update}
    ]
    for id_ in ids_to_remove:
        client.delete("hospitals", id=f"eq.{id_}")

    # Insert new rows in chunks to stay below request size limits.
    for i in range(0, len(to_insert), 500):
        client.upsert("hospitals", to_insert[i : i + 500], on_conflict="id")

    # Patch matched rows individually — per-state volume is small.
    for id_, payload in to_update:
        client.update("hospitals", {"id": id_}, payload)

    log(
        f"+{len(to_insert)} new, ~{len(to_update)} updated, -{len(ids_to_remove)} removed",
        state_code=state_code,
    )

    return len(to_insert), len(to_update), len(ids_to_remove)


def is_ocr_extraction(extraction_source: str) -> bool:
    return extraction_source == EXTRACTION_SOURCE_PDF_OCR
