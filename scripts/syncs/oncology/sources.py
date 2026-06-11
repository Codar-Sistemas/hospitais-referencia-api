"""
Resolves the CURRENT URLs of the CGCAN files by scraping the official page.

The main file's name carries a date (hospitais-habilitados-em-oncologia-
abril-2026.xlsx) and changes on every monthly update — a stored URL rots.
Each sync run re-resolves all three from the page and refreshes
`vertical_sources.url` (kept as "last known URL" / fallback).
"""

from __future__ import annotations

import unicodedata
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from scripts.shared.config import REQUEST_TIMEOUT, USER_AGENT
from scripts.shared.http import build_session

SOURCE_PAGE_URL = "https://www.gov.br/saude/pt-br/composicao/saes/cgcan/hospitais-habilitados"

# source_key -> substring that must appear in the (normalized) file href.
SOURCE_LINK_PATTERNS: dict[str, str] = {
    "oncology_qualifications": "oncologia",
    "breast_reconstruction": "reconstrucao-mamaria",
    "synchronous_treatment": "sincronico",
}


class SourceResolutionError(RuntimeError):
    """The CGCAN page no longer matches the link patterns — page was likely
    restructured. Actionable: lists what was found."""


def resolve_source_urls(session: requests.Session | None = None) -> dict[str, str]:
    """Returns {source_key: absolute_url} for every pattern. Raises
    SourceResolutionError when a pattern has no match or is ambiguous;
    network errors propagate (caller falls back to stored URLs)."""
    response = (session or build_session()).get(
        SOURCE_PAGE_URL,
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    xlsx_urls: list[str] = []
    for anchor in soup.find_all("a", href=True):
        href_value = anchor["href"]
        href = href_value if isinstance(href_value, str) else str(href_value[0])
        if _normalize(href).endswith(".xlsx"):
            absolute = urljoin(SOURCE_PAGE_URL, href)
            if absolute not in xlsx_urls:
                xlsx_urls.append(absolute)

    resolved: dict[str, str] = {}
    for source_key, pattern in SOURCE_LINK_PATTERNS.items():
        matches = [u for u in xlsx_urls if pattern in _normalize(u)]
        if len(matches) != 1:
            raise SourceResolutionError(
                f"Expected exactly 1 .xlsx link matching {pattern!r} on {SOURCE_PAGE_URL}, "
                f"found {len(matches)}. All .xlsx links: {xlsx_urls}"
            )
        resolved[source_key] = matches[0]
    return resolved


def _normalize(text: str) -> str:
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return stripped.lower()
