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

# The API silently caps `limit` at 20 no matter what is sent (verified live
# on 2026-08-12), so pagination must walk in steps of 20 until a short page.
LIST_PAGE_SIZE = 20
# Runaway guard: 2000 pages = 40k rows, far beyond any single unit type
# (CAPS, the largest planned vertical, has ~3.7k establishments).
LIST_MAX_PAGES = 2000

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


@dataclass
class CnesListedEstablishment:
    """One row of the paginated listing (`list_by_unit_type`): the same
    normalized contact fields plus the identity a vertical sync needs to
    seed records (name, UF/municipality codes, registry freshness)."""

    cnes: str
    name: str | None
    uf_code: int | None
    municipality_code: int | None
    address: str | None
    cep: str | None
    phone: str | None
    lat: float | None
    lng: float | None
    updated_at: str | None


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
            payload = self._get(f"{CNES_API_BASE_URL}/{candidate}")
            if payload is not None:
                return self._parse(cnes, payload)
        return None

    def list_by_unit_type(
        self,
        unit_type_code: int,
        uf_code: int | None = None,
    ) -> list[CnesListedEstablishment]:
        """Full paginated listing of a unit type (70 = CAPS, 69 = blood
        centers, ...), optionally restricted to a UF.

        Unlike `fetch`, this RAISES on persistent failure: a silently
        truncated listing would read as mass closures in the downstream
        diff, which is worse than an aborted sync."""
        rows: list[CnesListedEstablishment] = []
        offset = 0

        for _ in range(LIST_MAX_PAGES):
            params: dict[str, int] = {
                "codigo_tipo_unidade": unit_type_code,
                "limit": LIST_PAGE_SIZE,
                "offset": offset,
            }
            if uf_code is not None:
                params["codigo_uf"] = uf_code

            payload = self._get(CNES_API_BASE_URL, params=params)
            if payload is None:
                raise RuntimeError(
                    f"CNES API listing failed at offset {offset} "
                    f"(unit type {unit_type_code}) after retries"
                )

            page = payload.get("estabelecimentos")
            if not isinstance(page, list):
                raise RuntimeError(
                    f"CNES API listing returned unexpected shape at offset "
                    f"{offset} (unit type {unit_type_code})"
                )

            rows.extend(self._parse_listed(item) for item in page)

            if len(page) < LIST_PAGE_SIZE:
                return rows
            offset += LIST_PAGE_SIZE

        raise RuntimeError(
            f"CNES API listing exceeded {LIST_MAX_PAGES} pages "
            f"(unit type {unit_type_code}) — runaway pagination?"
        )

    # ------------------------------------------------------------------
    def _get(
        self,
        url: str,
        params: dict[str, int] | None = None,
    ) -> dict[str, Any] | None:
        label = url if params is None else f"{url} {params}"
        for attempt in range(1, self._max_retries + 1):
            self._throttle()
            try:
                response = self._session.get(url, params=params, timeout=self._timeout_s)
            except requests.RequestException as e:
                log(f"CNES API request failed ({label}, attempt {attempt}): {e}")
                time.sleep(self._delay_s * (2**attempt))
                continue

            if response.status_code == 404:
                return None
            if response.ok:
                try:
                    data = response.json()
                except ValueError:
                    log(f"CNES API returned non-JSON body for {label}")
                    return None
                return data if isinstance(data, dict) else None

            # 5xx / 429: back off and retry.
            log(f"CNES API HTTP {response.status_code} for {label} (attempt {attempt})")
            time.sleep(self._delay_s * (2**attempt))
        return None

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._delay_s:
            time.sleep(self._delay_s - elapsed)
        self._last_request_ts = time.monotonic()

    def _parse(self, cnes: str, data: dict[str, Any]) -> CnesEstablishment:
        lat, lng = _parse_coords(data)

        return CnesEstablishment(
            cnes=cnes,
            address=_parse_address(data),
            cep=_clean_str(data.get("codigo_cep_estabelecimento")),
            phone=_clean_str(data.get("numero_telefone_estabelecimento")),
            lat=lat,
            lng=lng,
        )

    def _parse_listed(self, data: dict[str, Any]) -> CnesListedEstablishment:
        lat, lng = _parse_coords(data)

        # nome_fantasia is what people know the unit by; the razão social of
        # the maintainer ("MUNICIPIO DE ...") is only a fallback.
        name = _clean_str(data.get("nome_fantasia")) or _clean_str(data.get("nome_razao_social"))

        return CnesListedEstablishment(
            cnes=_clean_str(data.get("codigo_cnes")) or "",
            name=name,
            uf_code=_as_int(data.get("codigo_uf")),
            municipality_code=_as_int(data.get("codigo_municipio")),
            address=_parse_address(data),
            cep=_clean_str(data.get("codigo_cep_estabelecimento")),
            phone=_clean_str(data.get("numero_telefone_estabelecimento")),
            lat=lat,
            lng=lng,
            updated_at=_clean_str(data.get("data_atualizacao")),
        )


def _parse_address(data: dict[str, Any]) -> str | None:
    street = _clean_str(data.get("endereco_estabelecimento"))
    number = _clean_str(data.get("numero_estabelecimento"))
    neighborhood = _clean_str(data.get("bairro_estabelecimento"))
    address_parts = [p for p in (street, number, neighborhood) if p]
    return ", ".join(address_parts) if address_parts else None


def _parse_coords(data: dict[str, Any]) -> tuple[float | None, float | None]:
    lat = _as_float(data.get("latitude_estabelecimento_decimo_grau"))
    lng = _as_float(data.get("longitude_estabelecimento_decimo_grau"))
    in_brazil = (
        lat is not None
        and lng is not None
        and _LAT_RANGE[0] <= lat <= _LAT_RANGE[1]
        and _LNG_RANGE[0] <= lng <= _LNG_RANGE[1]
    )
    if not in_brazil:
        return None, None
    return lat, lng


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


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
