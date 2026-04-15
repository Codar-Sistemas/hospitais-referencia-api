"""
Provider Nominatim (OpenStreetMap) para geocoding.

Gratuito, sem necessidade de API key, respeitando o termo de uso:
  - 1 requisição por segundo no máximo
  - User-Agent identificável
  - https://operations.osmfoundation.org/policies/nominatim/
"""
from __future__ import annotations

import time
from typing import Optional

import requests

from scripts.providers.base import GeocodingProvider, GeocodingResult

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
DEFAULT_RATE_LIMIT_S = 1.1  # um pouco acima de 1s por margem
DEFAULT_TIMEOUT_S = 15


class NominatimProvider(GeocodingProvider):
    """Implementação de GeocodingProvider usando Nominatim/OpenStreetMap."""

    name = "nominatim"

    def __init__(
        self,
        session: Optional[requests.Session] = None,
        user_agent: Optional[str] = None,
        rate_limit_s: float = DEFAULT_RATE_LIMIT_S,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._rate_limit_s = rate_limit_s
        self._timeout_s = timeout_s
        self._last_req_ts = 0.0

        if user_agent:
            self._session.headers.setdefault("User-Agent", user_agent)

    def _wait_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_req_ts
        if elapsed < self._rate_limit_s:
            time.sleep(self._rate_limit_s - elapsed)
        self._last_req_ts = time.monotonic()

    def geocode(self, query: str) -> Optional[GeocodingResult]:
        if not query or not query.strip():
            return None

        self._wait_rate_limit()

        try:
            resp = self._session.get(
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
            if not resp.ok:
                return None
            data = resp.json()
            if not data:
                return None
            item = data[0]
            return GeocodingResult(
                lat=float(item["lat"]),
                lng=float(item["lon"]),
                fonte=self.name,
            )
        except (requests.RequestException, ValueError, KeyError):
            return None
