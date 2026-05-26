"""
Decide whether a state needs to be re-processed.

The decision combines the last-updated timestamp scraped from the page
and the SHA-256 of the downloaded PDF — content can change even when
the visible timestamp does not.
"""

from __future__ import annotations

from datetime import datetime


def needs_update(
    state_row: dict,
    site_updated_at: datetime | None,
    force: bool = False,
) -> bool:
    """
    Decide based on stored metadata vs the page-reported timestamp.
    The PDF hash check is intentionally NOT done here — it requires a
    download, which the caller does separately when this returns False.
    """
    if force:
        return True
    if state_row.get("updated_at") is None:
        return True
    if site_updated_at and state_row["updated_at"]:
        previous = datetime.fromisoformat(state_row["updated_at"].replace("Z", "+00:00"))
        if site_updated_at > previous:
            return True
    return False


def pdf_hash_changed(state_row: dict, new_hash: str) -> bool:
    return state_row.get("pdf_hash") != new_hash
