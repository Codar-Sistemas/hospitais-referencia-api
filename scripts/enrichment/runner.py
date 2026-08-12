"""
CNES confirmation/enrichment batch (fase 1 do roadmap CNES-first).

Walks hospitals that carry a CNES code, fetches the official registry entry
(DEMAS open-data API) and:

  - records the comparison outcome (`cnes_confirmed`, `cnes_divergences`,
    `cnes_checked_at` — see sql/027);
  - fills contact fields the extraction left empty (address, phones);
  - resolves coordinates for rows still without them (official registry
    wins; the Nominatim batch remains the fallback).

It never overwrites a non-empty extracted value: a divergence is recorded,
not silently "fixed" — the extracted value is what the Ministry published,
the registry is what the maintainer declared, and a human decides.

Environment:
  SUPABASE_URL          Supabase project URL
  SUPABASE_SERVICE_KEY  service_role key (NEVER the anon key here)
  SUPABASE_REST_URL     optional local PostgREST override
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime
from typing import Any

from scripts.enrichment.policy import evaluate
from scripts.providers.cnes_api import CnesApiProvider
from scripts.shared.config import (
    GEOCODING_SOURCE_CNES_API,
    GEOCODING_STATUS_OK,
    VERTICAL_ONCOLOGY,
    VERTICAL_RARE_DISEASES,
    VERTICAL_VENOMOUS_ANIMALS,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log

DEFAULT_LIMIT = 300

VERTICAL_CHOICES = (
    VERTICAL_VENOMOUS_ANIMALS,
    VERTICAL_RARE_DISEASES,
    VERTICAL_ONCOLOGY,
)


def enrich(
    client: SupabaseClient,
    provider: CnesApiProvider | None = None,
    *,
    vertical: str | None = None,
    limit: int = DEFAULT_LIMIT,
    dry_run: bool = False,
) -> dict[str, int]:
    provider = provider or CnesApiProvider()

    params: dict[str, str] = {
        "select": "id,cnes,name,phones,address,lat,lng,geocoding_status",
        "cnes": "not.is.null",
        # Oldest checks first, never-checked before everything: successive
        # runs walk the whole dataset even under a per-run limit.
        "order": "cnes_checked_at.asc.nullsfirst,id.asc",
        "limit": str(limit),
    }
    if vertical is not None:
        params["verticals"] = f"cs.{{{vertical}}}"

    rows = client.select("hospitals", **params)
    counts = {"checked": 0, "confirmed": 0, "diverged": 0, "misses": 0, "filled": 0}

    for row in rows:
        cnes = str(row.get("cnes") or "")
        if not any(ch.isdigit() for ch in cnes):
            continue  # an empty/garbled code would hit the listing endpoint

        counts["checked"] += 1
        now = datetime.now(UTC).isoformat()
        registry = provider.fetch(cnes)

        if registry is None:
            # Not in the registry (or API down for this code): record the
            # attempt, keep whatever confirmation state the row already has.
            counts["misses"] += 1
            log(f"registry miss for CNES {cnes} ({row.get('name')})", state_code="BR")
            if not dry_run:
                client.update("hospitals", {"id": row["id"]}, {"cnes_checked_at": now})
            continue

        outcome = evaluate(
            phones=row.get("phones"),
            lat=row.get("lat"),
            lng=row.get("lng"),
            registry=registry,
        )

        payload: dict[str, Any] = {
            "cnes_checked_at": now,
            "cnes_confirmed": outcome.confirmed,
            "cnes_divergences": outcome.divergences,
        }

        filled: list[str] = []
        if not row.get("address") and registry.address:
            payload["address"] = registry.address
            filled.append("address")
        if not row.get("phones") and registry.phone:
            payload["phones"] = registry.phone
            filled.append("phones")
        if row.get("lat") is None and registry.lat is not None and registry.lng is not None:
            payload.update(
                {
                    "lat": registry.lat,
                    "lng": registry.lng,
                    "geocoding_status": GEOCODING_STATUS_OK,
                    "geocoding_source": GEOCODING_SOURCE_CNES_API,
                    "geocoded_at": now,
                }
            )
            filled.append("coords")

        if outcome.confirmed:
            counts["confirmed"] += 1
        if outcome.divergences:
            counts["diverged"] += 1
            log(
                f"CNES {cnes} diverges on {','.join(outcome.divergences)} ({row.get('name')})",
                state_code="BR",
            )
        if filled:
            counts["filled"] += 1

        if dry_run:
            log(
                f"[dry-run] CNES {cnes}: confirmed={outcome.confirmed} "
                f"divergences={outcome.divergences} fill={filled}",
                state_code="BR",
            )
            continue

        client.update("hospitals", {"id": row["id"]}, payload)

    log(
        f"enrichment: {counts['checked']} checked, {counts['confirmed']} confirmed, "
        f"{counts['diverged']} diverged, {counts['misses']} registry misses, "
        f"{counts['filled']} rows filled",
        state_code="BR",
    )
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Confirm/enrich hospitals against the official CNES registry."
    )
    parser.add_argument("--vertical", choices=VERTICAL_CHOICES, default=None)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    rest_base = os.environ.get("SUPABASE_REST_URL")  # local PostgREST override
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(1)
    client = SupabaseClient(url, key, rest_base=rest_base)

    enrich(client, vertical=args.vertical, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
