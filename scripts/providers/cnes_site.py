"""
Client for the cnes.datasus.gov.br site services (the JSON API behind the
CNES web frontend).

Why it exists: the DEMAS open-data API lists establishments by unit type but
does not expose the SUBTYPE (CAPS I/II/III/AD/i, blood-center UCT/UC/...)
nor the city/state as text — this endpoint gives all three in one call,
keyed by the 13-digit CO_UNIDADE that the DEMAS listing already returns.
The alternative was downloading the 615 MB monthly CNES base for a 7.5 MB
table.

Undocumented service, so: defensive parsing, per-row failures degrade to
None (the sync decides how many misses it tolerates), and a Referer header
because the backend expects to be called by its own frontend.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests

from scripts.shared.config import USER_AGENT
from scripts.shared.logger import log

CNES_SITE_BASE_URL = "https://cnes.datasus.gov.br/services/estabelecimentos"
DEFAULT_TIMEOUT_S = 20
DEFAULT_DELAY_S = 0.5


@dataclass
class CnesSiteDetails:
    """The slice of the site payload the verticals need."""

    cnes: str
    name: str | None
    uf: str | None
    city: str | None
    unit_type: str | None
    subtype: str | None


class CnesSiteProvider:
    """Fetches establishment details by 13-digit CO_UNIDADE. Never raises —
    a failed lookup degrades to None and the caller decides the guardrail."""

    def __init__(
        self,
        session: requests.Session | None = None,
        max_retries: int = 3,
        delay_s: float = DEFAULT_DELAY_S,
        timeout_s: int = DEFAULT_TIMEOUT_S,
    ):
        self._session = session or requests.Session()
        self._session.headers["User-Agent"] = USER_AGENT
        self._session.headers["Referer"] = "https://cnes.datasus.gov.br/"
        self._session.headers["Accept"] = "application/json"
        self._max_retries = max_retries
        self._delay_s = delay_s
        self._timeout_s = timeout_s
        self._last_request_ts = 0.0

    def fetch_details(self, unit_code: str) -> CnesSiteDetails | None:
        url = f"{CNES_SITE_BASE_URL}/{unit_code}"
        for attempt in range(1, self._max_retries + 1):
            self._throttle()
            try:
                response = self._session.get(url, timeout=self._timeout_s)
            except requests.RequestException as e:
                log(f"CNES site request failed ({unit_code}, attempt {attempt}): {e}")
                time.sleep(self._delay_s * (2**attempt))
                continue

            if response.status_code == 404:
                return None
            if response.ok:
                try:
                    data = response.json()
                except ValueError:
                    log(f"CNES site returned non-JSON body for {unit_code}")
                    return None
                return self._parse(data) if isinstance(data, dict) else None

            log(f"CNES site HTTP {response.status_code} for {unit_code} (attempt {attempt})")
            time.sleep(self._delay_s * (2**attempt))
        return None

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_ts
        if elapsed < self._delay_s:
            time.sleep(self._delay_s - elapsed)
        self._last_request_ts = time.monotonic()

    def _parse(self, data: dict[str, Any]) -> CnesSiteDetails | None:
        cnes = _clean_str(data.get("cnes"))
        if not cnes:
            return None

        return CnesSiteDetails(
            cnes=cnes,
            name=_clean_str(data.get("noFantasia")) or _clean_str(data.get("noEmpresarial")),
            uf=_clean_str(data.get("uf")),
            city=_clean_str(data.get("noMunicipio")),
            unit_type=_clean_str(data.get("dsTpUnidade")),
            subtype=_clean_str(data.get("dsStpUnidade")),
        )


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
