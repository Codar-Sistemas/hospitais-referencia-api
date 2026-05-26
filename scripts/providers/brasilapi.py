"""
BrasilAPI CEP provider.

Free, no API key required. Uses BrasilAPI v2 which aggregates multiple
sources and returns coordinates when available.

https://brasilapi.com.br/docs#tag/CEP-V2
"""

from __future__ import annotations

import re

import requests

from scripts.providers.base import CepLookupResult, CepProvider

BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2/{cep}"
DEFAULT_TIMEOUT_S = 15


class BrasilApiCepProvider(CepProvider):
    """CepProvider backed by BrasilAPI v2."""

    name = "brasilapi"

    def __init__(
        self,
        session: requests.Session | None = None,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._timeout_s = timeout_s

    def lookup(self, cep: str) -> CepLookupResult | None:
        clean_cep = re.sub(r"\D", "", cep or "")
        if len(clean_cep) != 8:
            return None

        try:
            response = self._session.get(
                BRASILAPI_CEP_URL.format(cep=clean_cep),
                timeout=self._timeout_s,
            )
            if not response.ok:
                return None
            data = response.json()
        except (requests.RequestException, ValueError):
            return None

        location = data.get("location", {}) or {}
        coordinates = location.get("coordinates", {}) or {}
        lat = coordinates.get("latitude")
        lng = coordinates.get("longitude")

        return CepLookupResult(
            cep=clean_cep,
            street=data.get("street") or None,
            neighborhood=data.get("neighborhood") or None,
            city=data.get("city") or None,
            state_code=data.get("state") or None,
            lat=float(lat) if lat else None,
            lng=float(lng) if lng else None,
        )
