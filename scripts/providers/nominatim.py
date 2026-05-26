"""
Nominatim (OpenStreetMap) geocoding provider.

Free, no API key required. Usage policy:
  - max 1 request/second
  - identifiable User-Agent
  - https://operations.osmfoundation.org/policies/nominatim/
"""

from __future__ import annotations

import time

import requests

from scripts.providers.base import GeocodingProvider, GeocodingResult

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_RATE_LIMIT_S = 1.1  # slightly above 1s for safety
DEFAULT_TIMEOUT_S = 15


class NominatimProvider(GeocodingProvider):
    """GeocodingProvider backed by Nominatim/OpenStreetMap."""

    name = "nominatim"

    def __init__(
        self,
        session: requests.Session | None = None,
        user_agent: str | None = None,
        rate_limit_s: float = DEFAULT_RATE_LIMIT_S,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._rate_limit_s = rate_limit_s
        self._timeout_s = timeout_s
        self._last_request_ts = 0.0

        if user_agent:
            self._session.headers.setdefault("User-Agent", user_agent)

    def _wait_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._rate_limit_s:
            time.sleep(self._rate_limit_s - elapsed)
        self._last_request_ts = time.monotonic()

    def geocode(self, query: str) -> GeocodingResult | None:
        if not query or not query.strip():
            return None

        self._wait_rate_limit()

        try:
            response = self._session.get(
                NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "br",
                    "addressdetails": 0,
                },
                timeout=self._timeout_s,
            )
            if not response.ok:
                return None
            data = response.json()
            if not data:
                return None
            item = data[0]
            return GeocodingResult(
                lat=float(item["lat"]),
                lng=float(item["lon"]),
                source=self.name,
            )
        except (requests.RequestException, ValueError, KeyError):
            return None
