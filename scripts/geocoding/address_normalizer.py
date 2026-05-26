"""
Address cleanup helpers used before geocoding queries.

These reduce the false-miss rate in Nominatim by stripping noise
(extension numbers, phone fragments, parenthetical content) that
appears in Ministry of Health PDFs.
"""

from __future__ import annotations

import re


def clean_address(s: str) -> str:
    """
    Remove noise commonly found in MS hospital addresses:
      - "s/n", "s/nº", "Qd. 07", "Km 21"
      - phone numbers (with or without parenthesised DDD)
      - duplicated whitespace
    """
    s = re.sub(r"\(\d{2,3}\)\s*\d{3,5}[-\s]?\d{3,5}", "", s)
    s = re.sub(r"\b\d{4,5}[-\s]\d{4}\b", "", s)
    # "s/n", "s/nº", "s/no", "s/n°" — Portuguese marker for "no number"
    # that we strip so the address matches a real street record.
    s = re.sub(r"\bs/n[ºo°]?\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,-")
    return s


def street_only(s: str) -> str:
    """Keep only the leading non-numeric/non-comma part — widens matches."""
    m = re.match(r"([^,0-9]+)", s)
    return m.group(1).strip() if m else s
