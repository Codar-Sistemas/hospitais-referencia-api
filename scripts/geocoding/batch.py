"""
Batch geocoding of pending hospitals — shared across all verticals.

Moved out of the venomous_animals runner so the rare_diseases sync (and
future verticals) reuse the same loop. The `hospitals.geocoding_status`
filter is vertical-agnostic by design: a single nightly pass clears the
queue regardless of which sync enqueued the rows.
"""

from __future__ import annotations

from datetime import UTC, datetime

from scripts.shared.config import (
    GEOCODING_STATUS_FAILED,
    GEOCODING_STATUS_OK,
    GEOCODING_STATUS_PENDING,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.shared.types import GeocodingSummary


def geocode_pending(
    client: SupabaseClient,
    state_code: str | None = None,
    vertical: str | None = None,
    limit: int = 1000,
) -> GeocodingSummary:
    """
    Geocode hospitals with status 'pending'.
    Nominatim caps at 1 req/s -> ~17 minutes for 1000 records.
    """
    from scripts.geocoding.runner import Geocoder

    filters = {
        "select": "id,state_code,city,name,address",
        "geocoding_status": f"eq.{GEOCODING_STATUS_PENDING}",
        "limit": str(limit),
    }
    if state_code:
        filters["state_code"] = f"eq.{state_code}"
    if vertical:
        filters["verticals"] = f"cs.{{{vertical}}}"

    pending = client.select("hospitals", **filters)
    if not pending:
        return {"geocoded": 0, "failed": 0}

    log(f"Geocoding {len(pending)} hospitals ...")
    geocoder = Geocoder(
        supabase_url=client.url,
        supabase_key=client.key,
    )
    ok_count = failed_count = 0
    for i, hospital in enumerate(pending, 1):
        result = geocoder.geocode_address(
            hospital.get("address") or "",
            hospital["city"],
            hospital["state_code"],
        )
        now = datetime.now(UTC).isoformat()
        if result:
            client.update(
                "hospitals",
                {"id": hospital["id"]},
                {
                    "lat": result.lat,
                    "lng": result.lng,
                    "geocoding_status": GEOCODING_STATUS_OK,
                    "geocoding_source": result.source,
                    "geocoded_at": now,
                },
            )
            ok_count += 1
        else:
            client.update(
                "hospitals",
                {"id": hospital["id"]},
                {
                    "geocoding_status": GEOCODING_STATUS_FAILED,
                    "geocoded_at": now,
                },
            )
            failed_count += 1
        if i % 20 == 0:
            log(f"  {i}/{len(pending)} (ok={ok_count}, failed={failed_count})")

    log(f"Done: {ok_count} ok, {failed_count} failed")
    return {"geocoded": ok_count, "failed": failed_count}
