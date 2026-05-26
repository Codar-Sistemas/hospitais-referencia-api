"""
Parser for reference-hospital PDFs (Brazilian Ministry of Health).

All state PDFs share the same tabular template:
  MUNICIPIO | UNIDADE DE SAUDE | ENDERECO | TELEFONES | CNES | ATENDIMENTOS

Extraction is word-level and uses the lines drawn on the PDF as
row/column boundaries.

NOTE on language: the PDFs themselves are Portuguese — the matching
patterns below (`MUNICIPIO`, `ENDERECO`, treatment names with accents,
etc.) MUST stay Portuguese because that is what the source documents
contain. Only the canonical output strings are English.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

import pdfplumber

from scripts.shared.config import (
    CANONICAL_TREATMENTS,
    TREATMENT_ANTIARACHNIDIC,
    TREATMENT_BOTHROPIC,
    TREATMENT_CROTALIC,
    TREATMENT_ELAPIDIC,
    TREATMENT_LACHETIC,
    TREATMENT_LONOMIC,
    TREATMENT_LOXOSCELIC,
    TREATMENT_PHONEUTRIC,
    TREATMENT_SCORPIONIC,
)

# Map from Portuguese keyword (accent-stripped, lowercase) found in the
# source PDF to the canonical English output value written to the DB.
# Keys MUST be Portuguese — the PDFs are Portuguese and cannot change.
TREATMENT_TYPES: dict[str, str] = {
    "botropico": TREATMENT_BOTHROPIC,
    "crotalico": TREATMENT_CROTALIC,
    "elapidico": TREATMENT_ELAPIDIC,
    "laquetico": TREATMENT_LACHETIC,
    "escorpionico": TREATMENT_SCORPIONIC,
    "loxoscelico": TREATMENT_LOXOSCELIC,
    "foneutrico": TREATMENT_PHONEUTRIC,
    "lonomico": TREATMENT_LONOMIC,
    "antiaracnidico": TREATMENT_ANTIARACHNIDIC,
}

# Composite treatment markers seen in a few PDFs (e.g. MG/Uberaba). The
# raw text is preserved in `treatments_raw`; here we expand into both
# components so they appear individually in `treatments`.
COMPOSITE_TREATMENTS: dict[str, list[str]] = {
    "botropico-crotalico": [TREATMENT_BOTHROPIC, TREATMENT_CROTALIC],
    "botropicocrotalico": [TREATMENT_BOTHROPIC, TREATMENT_CROTALIC],
}


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn"
    )


def _clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def normalize_treatments(text: str | None) -> list[str]:
    """
    Extract the canonical (English) list of treatment types from the
    Portuguese treatments cell in the PDF.

    Tolerates accent / case variations and composite treatments
    (e.g. "Botropico-Crotalico" expands to both).
    """
    if not text:
        return []
    normalized = _strip_accents(text).lower()
    found: set[str] = set()

    # Composite types first so we never double-count.
    for key, types in COMPOSITE_TREATMENTS.items():
        if key in normalized:
            found.update(types)

    for pt_key, canonical in TREATMENT_TYPES.items():
        if pt_key in normalized:
            found.add(canonical)

    # Preserve canonical ordering for stable output.
    return [t for t in CANONICAL_TREATMENTS if t in found]


def _cell_text(words: list[dict]) -> str:
    """Join words inside a cell respecting visual reading order (top, x)."""
    if not words:
        return ""
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]["top"]) < 4:
            lines[-1].append(w)
        else:
            lines.append([w])
    parts = []
    for line in lines:
        line.sort(key=lambda w: w["x0"])
        parts.append(" ".join(w["text"] for w in line))
    return " ".join(parts)


def _merge_edges(edges: Iterable[float], tol: float = 3.0) -> list[float]:
    edges = sorted(edges)
    out: list[float] = []
    for e in edges:
        if not out or e - out[-1] > tol:
            out.append(e)
    return out


def _extract_page(page) -> list[dict]:
    # Detect horizontal/vertical PDF lines as table boundaries.
    shapes = page.lines + page.rects
    h_edges, v_edges = set(), set()
    for r in shapes:
        h = r.get("height", 0) or 0
        w = r.get("width", 0) or 0
        if abs(h) < 2 and w > 30:
            h_edges.add(round(r["top"], 1))
        if abs(w) < 2 and h > 10:
            v_edges.add(round(r["x0"], 1))

    h_edges = _merge_edges(h_edges)
    v_edges = _merge_edges(v_edges)

    if len(v_edges) < 7 or len(h_edges) < 2:
        return []

    words = page.extract_words(use_text_flow=False)

    # Drop header row. PDF text is Portuguese — match those tokens.
    header_bottom = 0.0
    for w in words:
        upper = _strip_accents(w["text"]).upper().strip()
        if upper in ("MUNICIPIO", "ENDERECO", "TELEFONES", "CNES"):
            header_bottom = max(header_bottom, w["bottom"])

    words = [w for w in words if w["top"] > header_bottom + 1]
    h_edges = [e for e in h_edges if e > header_bottom]

    if len(h_edges) < 2:
        return []

    row_bands = list(zip(h_edges[:-1], h_edges[1:]))
    col_bands = list(zip(v_edges[:-1], v_edges[1:]))

    grid: list[list[list[dict]]] = [[[] for _ in col_bands] for _ in row_bands]
    for w in words:
        wy = (w["top"] + w["bottom"]) / 2
        wx = (w["x0"] + w["x1"]) / 2
        ri = next((i for i, (y0, y1) in enumerate(row_bands) if y0 <= wy <= y1), None)
        ci = next((i for i, (x0, x1) in enumerate(col_bands) if x0 <= wx <= x1), None)
        if ri is not None and ci is not None:
            grid[ri][ci].append(w)

    records: list[dict] = []
    for row in grid:
        cells = [_cell_text(c) for c in row]
        if not any(cells) or not cells[0]:
            continue
        if _strip_accents(cells[0]).upper() == "MUNICIPIO":
            continue

        # Expect exactly 6 logical columns.
        if len(cells) >= 6:
            city, name, address, phones, cnes = cells[:5]
            treatments_raw = cells[5] if len(cells) == 6 else " ".join(cells[5:])
        else:
            continue  # malformed row; skip

        records.append(
            {
                "city": _clean(city),
                "name": _clean(name) or None,
                "address": _clean(address) or None,
                "phones": _clean(phones) or None,
                "cnes": _clean(cnes) or None,
                "treatments_raw": _clean(treatments_raw) or None,
            }
        )
    return records


def parse_pdf(path: str, state_code: str) -> list[dict]:
    """Parse a hospital PDF and return a list of records (DB-ready shape)."""
    out: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for record in _extract_page(page):
                record["state_code"] = state_code
                record["treatments"] = normalize_treatments(record["treatments_raw"])
                out.append(record)
    return out


if __name__ == "__main__":
    import json
    import sys

    path = sys.argv[1]
    state_code = sys.argv[2] if len(sys.argv) > 2 else "SP"
    records = parse_pdf(path, state_code)
    print(json.dumps(records, ensure_ascii=False, indent=2))
    print(f"\n# {len(records)} records", file=sys.stderr)
