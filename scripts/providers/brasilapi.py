"""
Provider BrasilAPI para consulta de CEP.

Gratuito, sem necessidade de API key. Usa a v2 da BrasilAPI que
combina múltiplas fontes e retorna coordenadas quando disponíveis.

https://brasilapi.com.br/docs#tag/CEP-V2
"""
from __future__ import annotations

import re
from typing import Optional

import requests

from scripts.providers.base import CepLookupResult, CepProvider

BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2/{cep}"
DEFAULT_TIMEOUT_S = 15


class BrasilApiCepProvider(CepProvider):
    """Implementação de CepProvider usando BrasilAPI v2."""

    name = "brasilapi"

    def __init__(
        self,
        session: Optional[requests.Session] = None,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._timeout_s = timeout_s

    def lookup(self, cep: str) -> Optional[CepLookupResult]:
        cep_limpo = re.sub(r"\D", "", cep or "")
        if len(cep_limpo) != 8:
            return None

        try:
            r = self._session.get(
                BRASILAPI_CEP_URL.format(cep=cep_limpo),
                timeout=self._timeout_s,
            )
            if not r.ok:
                return None
            data = r.json()
        except (requests.RequestException, ValueError):
            return None

        loc = data.get("location", {}) or {}
        coords = loc.get("coordinates", {}) or {}
        lat = coords.get("latitude")
        lng = coords.get("longitude")

        return CepLookupResult(
            cep=cep_limpo,
            logradouro=data.get("street") or None,
            bairro=data.get("neighborhood") or None,
            cidade=data.get("city") or None,
            uf=data.get("state") or None,
            lat=float(lat) if lat else None,
            lng=float(lng) if lng else None,
        )
