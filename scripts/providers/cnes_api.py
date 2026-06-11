"""
CNES open-data API client (Ministério da Saúde).

The rare_diseases XLSX source lists only UF/city/CNES/name — no address,
phone or coordinates. This provider fills those gaps straight from the
official registry, which even includes lat/lng (so most rows skip the
Nominatim geocoding queue entirely).

Docs: https://apidadosabertos.saude.gov.br/  (no auth, generous limits)
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

from scripts.shared.config import USER_AGENT
from scripts.shared.logger import log

CNES_API_BASE_URL = "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos"
DEFAULT_TIMEOUT_S = 20
# Courtesy delay between calls — a national sync touches ~54 CNES, so even a
# generous pause keeps the whole enrichment under a minute.
DEFAULT_DELAY_S = 0.5

# Sanity bounds for Brazilian territory; the registry occasionally carries
# null-island or fat-fingered coordinates.
_LAT_RANGE = (-35.0, 6.0)
_LNG_RANGE = (-75.0, -32.0)


@dataclass
class CnesEstablishment:
    """Fields the sync needs from the registry, already normalized."""

    cnes: str
    address: str | None
    cep: str | None
    phone: str | None
    lat: float | None
    lng: float | None


class CnesApiProvider:
    """Fetches establishment details by CNES code. Never raises — a failed
    lookup degrades to None and the row falls back to Nominatim geocoding."""

    def __init__(
        self,
        session: requests.Session | None = None,
        max_retries: int = 3,
        delay_s: float = DEFAULT_DELAY_S,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._session.headers["User-Agent"] = USER_AGENT
        self._max_retries = max_retries
        self._delay_s = delay_s
        self._timeout_s = timeout_s
        self._last_request_ts = 0.0

    def fetch(self, cnes: str) -> CnesEstablishment | None:
        # The API accepts both zero-padded and bare codes; try as-given
        # first, then the alternate form on 404 to be safe either way.
        candidates = [cnes]
        stripped = cnes.lstrip("0") or cnes
        if stripped != cnes:
            candidates.append(stripped)

        for candidate in candidates:
            payload = self._get(candidate)
            if payload is not None:
                return self._parse(cnes, payload)
        return None

    # ------------------------------------------------------------------
    def _get(self, cnes: str) -> dict[str, Any] | None:
        url = f"{CNES_API_BASE_URL}/{cnes}"
        for attempt in range(1, self._max_retries + 1):
            self._throttle()
            try:
                response = self._session.get(url, timeout=self._timeout_s)
            except requests.RequestException as e:
                log(f"CNES API request failed ({cnes}, attempt {attempt}): {e}")
                time.sleep(self._delay_s * (2**attempt))
                continue

            if response.status_code == 404:
                return None
            if response.ok:
                try:
                    data = response.json()
                except ValueError:
                    log(f"CNES API returned non-JSON body for {cnes}")
                    return None
                return data if isinstance(data, dict) else None

            # 5xx / 429: back off and retry.
            log(f"CNES API HTTP {response.status_code} for {cnes} (attempt {attempt})")
            time.sleep(self._delay_s * (2**attempt))
        return None

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._delay_s:
            time.sleep(self._delay_s - elapsed)
        self._last_request_ts = time.monotonic()

    def _parse(self, cnes: str, data: dict[str, Any]) -> CnesEstablishment:
        street = _clean_str(data.get("endereco_estabelecimento"))
        number = _clean_str(data.get("numero_estabelecimento"))
        neighborhood = _clean_str(data.get("bairro_estabelecimento"))
        address_parts = [p for p in (street, number, neighborhood) if p]
        address = ", ".join(address_parts) if address_parts else None

        lat = _as_float(data.get("latitude_estabelecimento_decimo_grau"))
        lng = _as_float(data.get("longitude_estabelecimento_decimo_grau"))
        in_brazil = (
            lat is not None
            and lng is not None
            and _LAT_RANGE[0] <= lat <= _LAT_RANGE[1]
            and _LNG_RANGE[0] <= lng <= _LNG_RANGE[1]
        )
        if not in_brazil:
            lat = lng = None

        return CnesEstablishment(
            cnes=cnes,
            address=address,
            cep=_clean_str(data.get("codigo_cep_estabelecimento")),
            phone=_clean_str(data.get("numero_telefone_estabelecimento")),
            lat=lat,
            lng=lng,
        )


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
