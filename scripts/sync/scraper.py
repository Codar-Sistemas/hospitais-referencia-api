"""
Scraper for gov.br state pages: fetches the page (or PDF directly) and
returns the metadata sync uses to detect change.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime, timedelta, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scripts.shared.config import REQUEST_TIMEOUT, USER_AGENT
from scripts.shared.http import build_session

# Last-updated timestamp shown on the source page: "Atualizado em 10/02/2026 18h04"
# Pattern is Portuguese — that is what gov.br renders.
RE_UPDATED = re.compile(
    r"Atualizado\s+em\s+(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2})h(\d{2})",
    re.IGNORECASE,
)

_session = build_session()


def fetch_page_metadata(page_url: str) -> tuple[datetime | None, str | None]:
    """
    Returns (last_updated_at, pdf_url) read from the state page.

    As of 2025 the state URLs serve the PDF directly with
    Content-Type: application/pdf — no intermediate HTML page. The old
    HTML scraping path is kept as a fallback for forward-compat.
    """
    response = _session.get(
        page_url,
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "").lower()

    # Newer case: the state URL is the PDF itself.
    if "application/pdf" in content_type:
        return None, page_url

    # Legacy case: HTML page with a PDF link.
    soup = BeautifulSoup(response.text, "html.parser")
    text = soup.get_text(" ", strip=True)

    updated_at = None
    match = RE_UPDATED.search(text)
    if match:
        d, mo, y, h, mi = map(int, match.groups())
        # gov.br displays Brasilia time (UTC-3). Store UTC in the DB.
        brasilia_tz = timezone(timedelta(hours=-3))
        local_dt = datetime(y, mo, d, h, mi, tzinfo=brasilia_tz)
        updated_at = local_dt.astimezone(UTC)

    # gov.br historically used three link patterns:
    #   1. href="...Arquivo.pdf"               (direct link)
    #   2. href="...estado/@@download/file"    (Plone download)
    #   3. href="...arquivo.xlsx"              (PE — now also PDF)
    pdf_url = None
    xlsx_url = None
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        lower = href.lower()
        if lower.endswith(".pdf") or lower.endswith("/@@download/file"):
            pdf_url = urljoin(page_url, href)
            break
        if lower.endswith(".xlsx"):
            xlsx_url = urljoin(page_url, href)

    if not pdf_url and xlsx_url:
        raise RuntimeError(
            f"State publishes XLSX ({xlsx_url}), not PDF. "
            "XLSX extraction is not implemented in this parser."
        )

    return updated_at, pdf_url


def download_pdf(url: str) -> tuple[bytes, str]:
    """Download a PDF and return (bytes, sha256_hex)."""
    response = _session.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.content, hashlib.sha256(response.content).hexdigest()


def is_image_based_pdf(path: str) -> bool:
    """
    Detect "scanned" PDFs: pages with no extractable text, only images.
    When this happens pdfplumber returns zero words — only OCR can help.

    Returns True only when every page has zero words AND at least one
    image (so that a totally empty PDF is not misclassified).
    """
    try:
        import pdfplumber  # local import keeps cold start light

        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                if page.extract_words():
                    return False
                if not page.images:
                    return False
        return True
    except Exception:
        return False
