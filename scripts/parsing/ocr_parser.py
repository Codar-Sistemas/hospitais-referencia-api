"""
Parser for OCR output (scanned PDFs).

Hybrid extraction strategy:

1. Use the X coordinate to locate the MUNICIPIO column (always leftmost).
   Each occurrence marks the start of a logical hospital — even when that
   hospital spans multiple visual lines in the PDF.

2. Within the Y band of each hospital, classify each word BY CONTENT
   (not by X position):
     - Phone:     pattern `(NN) NNNN-NNNN`
     - CNES:      exactly 7 digits
     - Treatment: keywords like `Botropico`, `Crotalico`, ...
     - Address:   anything left over

This is more tolerant than pure geometric detection because scanned
PDFs often lack clean column gaps (CNES and treatments tend to touch).

NOTE: matching is still done against Portuguese tokens — the scanned
PDFs are Portuguese and cannot change. Output values are English.
"""

from __future__ import annotations

import re
from typing import TypedDict

from scripts.parsing.ocr_engine import OcrPage, ocr_pdf
from scripts.parsing.text_parser import normalize_treatments
from scripts.shared.types import HospitalRecord, ParsedHospitalRow, WordBox


class _CityBand(TypedDict):
    """Y-band where a logical city name lives — collected per page so we
    can split the OCR words into rows even when Tesseract puts the city
    on a different line from the rest of the row."""

    y_center: float
    y_top: float
    y_bottom: float
    text: str


# Content-classification patterns
RE_PHONE = re.compile(r"\(\d{2}\)\s*\d{3,5}[-/]?\d{3,5}")
RE_PHONE_FRAGMENT = re.compile(r"^\(?\d{2,5}[-/]?\d{0,5}\)?$")
RE_CNES = re.compile(r"^\d{7}\|?$")  # CNES is 7 digits, sometimes glued to '|'
RE_DIGITS_ONLY = re.compile(r"^\d+[-/]?\d*$")

# Known treatment keywords (accent-stripped, lowercase) — matches the
# main parser's dictionary. These are Portuguese on purpose: the OCR
# reads Portuguese PDFs.
CANONICAL_TREATMENT_KEYWORDS_PT = {
    "botropico",
    "crotalico",
    "elapidico",
    "laquetico",
    "escorpionico",
    "loxoscelico",
    "foneutrico",
    "lonomico",
}

# Header words that must be discarded (Portuguese — from the PDFs)
HEADER_KEYWORDS = {
    "MUNICIPIO",
    "MUNICÍPIO",
    "UNIDADE",
    "ENDERECO",
    "ENDEREÇO",
    "TELEFONE",
    "TELEFONES",
    "CNES",
    "ATENDIMENTO",
    "ATENDIMENTOS",
    "SOROTERAPIA",
}

# Institutional footer words — not to be confused with city names
FOOTER_KEYWORDS = {
    "GOV.BR",
    "GOV.BR/SAUDE",
    "SUS",
    "MINISTERIO",
    "MINISTÉRIO",
    "SAUDE",
    "SAÚDE",
    "PATRIA",
    "PÁTRIA",
    "BRASIL",
}

# Vertical margin to treat words as belonging to the same line.
# A loose value helps join multi-word city names (Bom Jesus, Campo Maior)
# when Tesseract places them at slightly different Y offsets.
ROW_TOLERANCE_RATIO = 1.2


def _strip_accents(s: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _clean(s: str | None) -> str:
    if not s:
        return ""
    return " ".join(s.split()).strip()


def _is_header_word(text: str) -> bool:
    return _strip_accents(text).upper().strip(",:.") in HEADER_KEYWORDS


def _is_footer_word(text: str) -> bool:
    return _strip_accents(text).upper().strip(",:./") in FOOTER_KEYWORDS


def _group_lines(words: list[WordBox]) -> list[list[WordBox]]:
    """Group words into visual rows by Y center."""
    if not words:
        return []

    heights = [w["bottom"] - w["top"] for w in words if w["bottom"] > w["top"]]
    mean_height = sum(heights) / len(heights) if heights else 20.0
    tolerance = mean_height * ROW_TOLERANCE_RATIO

    sorted_words = sorted(words, key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))

    lines: list[list[WordBox]] = []
    for w in sorted_words:
        y_center = (w["top"] + w["bottom"]) / 2
        if lines:
            current = lines[-1]
            y_last = sum((p["top"] + p["bottom"]) / 2 for p in current) / len(current)
            if abs(y_center - y_last) <= tolerance:
                current.append(w)
                continue
        lines.append([w])

    for line in lines:
        line.sort(key=lambda w: w["x0"])
    return lines


def _detect_column_boundaries(
    lines: list[list[WordBox]], num_columns: int = 6
) -> list[tuple[float, float]]:
    """
    Infer column boundaries via gap detection.

    Algorithm:
      1. Build a density map of word positions.
      2. Detect contiguous empty stretches (gaps).
      3. The `num_columns - 1` widest gaps split the table.
    """
    if not lines or not any(lines):
        return []

    all_words = [w for line in lines for w in line]
    if not all_words:
        return []

    min_x = min(w["x0"] for w in all_words)
    max_x = max(w["x1"] for w in all_words)

    total_pixels = int(max_x - min_x) + 1
    if total_pixels <= 0:
        return []
    occupied = [False] * total_pixels
    for w in all_words:
        start = int(w["x0"] - min_x)
        end = int(w["x1"] - min_x) + 1
        for p in range(max(0, start), min(total_pixels, end)):
            occupied[p] = True

    gaps: list[tuple[int, int, int]] = []  # (start, end, size)
    i = 0
    while i < total_pixels:
        if not occupied[i]:
            j = i
            while j < total_pixels and not occupied[j]:
                j += 1
            gaps.append((i, j, j - i))
            i = j
        else:
            i += 1

    # Drop sub-20px gaps — those are just inter-word spaces.
    significant = [g for g in gaps if g[2] >= 20]
    significant.sort(key=lambda g: -g[2])
    boundaries = significant[: num_columns - 1]

    limits: list[float] = [min_x]
    for start, end, _ in boundaries:
        limits.append(min_x + (start + end) / 2)
    limits.append(max_x + 1)
    limits.sort()

    bands: list[tuple[float, float]] = []
    for i in range(len(limits) - 1):
        bands.append((limits[i], limits[i + 1]))

    return bands[:num_columns]


def _word_to_column(word: WordBox, bands: list[tuple[float, float]]) -> int | None:
    x_center = (word["x0"] + word["x1"]) / 2
    for i, (x0, x1) in enumerate(bands):
        if x0 <= x_center <= x1:
            return i
    return None


def _line_to_record(
    line: list[WordBox], bands: list[tuple[float, float]]
) -> ParsedHospitalRow | None:
    """Convert a row of words into a 6-column record. Returns None if invalid."""
    if not line:
        return None

    header_words = sum(1 for w in line if _is_header_word(w["text"]))
    if header_words >= 2:
        return None

    columns: list[list[str]] = [[] for _ in bands]
    for w in line:
        ci = _word_to_column(w, bands)
        if ci is not None:
            columns[ci].append(w["text"])

    cells = [_clean(" ".join(c)) for c in columns]

    if len(cells) < 6:
        return None

    city, name, address, phones, cnes = cells[:5]
    treatments_raw = cells[5] if len(cells) == 6 else " ".join(cells[5:])

    if not city or not name:
        return None

    return {
        "city": city,
        "name": name or None,
        "address": address or None,
        "phones": phones or None,
        "cnes": cnes or None,
        "treatments_raw": treatments_raw or None,
    }


def _merge_broken_lines(partial_records: list[ParsedHospitalRow]) -> list[ParsedHospitalRow]:
    """
    Scanned PDFs often split a single logical hospital into multiple
    visual lines. Heuristic: if a row has no city but other cells have
    content, it is a continuation of the previous row.
    """
    merged: list[ParsedHospitalRow] = []
    for record in partial_records:
        if not record.get("city") and merged:
            previous = merged[-1]
            merged[-1] = {
                "city": previous["city"],
                "name": _concat(previous.get("name"), record.get("name")),
                "address": _concat(previous.get("address"), record.get("address")),
                "phones": _concat(previous.get("phones"), record.get("phones")),
                "cnes": _concat(previous.get("cnes"), record.get("cnes")),
                "treatments_raw": _concat(
                    previous.get("treatments_raw"), record.get("treatments_raw")
                ),
            }
        else:
            merged.append(record)
    return merged


def _concat(previous: str | None, new: str | None) -> str | None:
    if not new:
        return previous
    if not previous:
        return new
    return f"{previous} {new}"


def _classify_word(text: str) -> str | None:
    """
    Classify a word by content.

    Returns 'phone' | 'cnes' | 'treatment' | None (free text).
    """
    stripped = text.strip(" ,.|")
    if not stripped:
        return None
    if RE_PHONE.search(stripped):
        return "phone"
    if stripped.startswith("(") and any(c.isdigit() for c in stripped):
        return "phone"
    if re.match(r"^\d{3,5}[-/]\d{3,5}(/\d{3,4})?$", stripped):
        return "phone"
    if RE_CNES.match(stripped):
        return "cnes"
    normalized = _strip_accents(stripped).lower().strip(",.")
    if normalized in CANONICAL_TREATMENT_KEYWORDS_PT:
        return "treatment"
    return None


def _estimate_name_column_start(page: OcrPage) -> float | None:
    """
    Estimate the X start of the `name` (UNIDADE) column.

    Heuristic: find typical hospital name prefixes (Hospital, UPA, SAMU,
    HC, Unidade, Posto) and return the median of their x0.
    """
    candidates = [
        w
        for w in page.words
        if w["text"]
        .lower()
        .startswith(("hospital", "unidade", "upa", "samu", "hc", "posto", "santa"))
    ]
    if not candidates:
        return None
    x0s: list[float] = sorted(float(w["x0"]) for w in candidates)
    return x0s[len(x0s) // 2]


def _city_column_position(page: OcrPage) -> tuple[float, float] | None:
    """
    Detect the approximate X band where city names live.

    Heuristic: leftmost cluster of x0 values with at least 3 members.
    """
    x0s = sorted(w["x0"] for w in page.words)
    if not x0s:
        return None

    clusters: list[list[float]] = [[x0s[0]]]
    for x in x0s[1:]:
        if x - clusters[-1][-1] <= 50:
            clusters[-1].append(x)
        else:
            clusters.append([x])

    for cluster in clusters:
        if len(cluster) >= 3:
            return (cluster[0] - 5, cluster[-1] + 50)
    return None


def _extract_page_ocr(page: OcrPage) -> list[ParsedHospitalRow]:
    """
    Extract records from one OCR page using content-based classification.
    """
    if not page.has_content:
        return []

    city_band = _city_column_position(page)
    if not city_band:
        return []

    heights = [w["bottom"] - w["top"] for w in page.words if w["bottom"] > w["top"]]
    mean_height = sum(heights) / len(heights) if heights else 20.0
    y_tolerance = mean_height * ROW_TOLERANCE_RATIO

    sorted_words = sorted(page.words, key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))

    cities: list[_CityBand] = []
    for w in sorted_words:
        if not (city_band[0] <= w["x0"] <= city_band[1]):
            continue
        if _is_header_word(w["text"]) or _is_footer_word(w["text"]):
            continue
        if not any(c.isalpha() for c in w["text"]):
            continue

        y_center = (w["top"] + w["bottom"]) / 2

        if cities:
            last = cities[-1]
            if abs(y_center - last["y_center"]) <= y_tolerance:
                last["text"] += " " + w["text"]
                last["y_bottom"] = max(last["y_bottom"], w["bottom"])
                continue

        cities.append(
            {
                "y_center": y_center,
                "y_top": w["top"],
                "y_bottom": w["bottom"],
                "text": w["text"],
            }
        )

    if not cities:
        return []

    records: list[ParsedHospitalRow] = []

    city_right_limit = _estimate_name_column_start(page) or (city_band[1] + 300)

    for i, city in enumerate(cities):
        y_start = city["y_top"] - mean_height / 4
        y_end = cities[i + 1]["y_top"] - mean_height / 4 if i + 1 < len(cities) else float("inf")

        hospital_words = [
            w
            for w in page.words
            if y_start <= (w["top"] + w["bottom"]) / 2 < y_end and not _is_header_word(w["text"])
        ]

        if not hospital_words:
            continue

        # Extend the city name with adjacent alphabetic words on the same
        # Y line and to the left of the name column (e.g. "Bom Jesus").
        city_y_center = (city["y_top"] + city["y_bottom"]) / 2
        extra_city_words = [
            w
            for w in hospital_words
            if abs((w["top"] + w["bottom"]) / 2 - city_y_center) <= y_tolerance
            and w["x0"] > city_band[1]
            and w["x0"] < city_right_limit
            and any(c.isalpha() for c in w["text"])
            and not _classify_word(w["text"])
        ]
        extra_city_words.sort(key=lambda w: w["x0"])
        if extra_city_words:
            city["text"] = city["text"] + " " + " ".join(w["text"] for w in extra_city_words)

        hospital_words.sort(key=lambda w: ((w["top"] + w["bottom"]) / 2, w["x0"]))

        name_tokens: list[str] = []
        address_tokens: list[str] = []
        phone_tokens: list[str] = []
        cnes_tokens: list[str] = []
        treatment_tokens: list[str] = []

        for w in hospital_words:
            text = w["text"]

            # Words inside the city band already counted in phase 1.
            if city_band[0] <= w["x0"] <= city_band[1]:
                continue

            kind = _classify_word(text)
            if kind == "phone":
                phone_tokens.append(text)
            elif kind == "cnes":
                cnes_tokens.append(text.strip(" |,"))
            elif kind == "treatment":
                treatment_tokens.append(text)
            else:
                # Free text — split heuristically into name vs address.
                # Words containing digits or starting with Rua/Av/Pca/etc
                # belong to the address. Portuguese tokens stay as input.
                if (
                    any(c.isdigit() for c in text)
                    or _strip_accents(text).lower().strip(",.")
                    in {
                        "rua",
                        "av",
                        "avenida",
                        "praca",
                        "praça",
                        "travessa",
                        "tv",
                        "estrada",
                        "rodovia",
                        "alameda",
                        "largo",
                        "km",
                    }
                    or address_tokens
                ):
                    address_tokens.append(text)
                else:
                    name_tokens.append(text)

        city_text = _clean(city["text"])
        name = _clean(" ".join(name_tokens))
        address = _clean(" ".join(address_tokens))
        phones = _clean(" ".join(phone_tokens))
        cnes = cnes_tokens[0] if cnes_tokens else None
        treatments_raw = _clean(", ".join(treatment_tokens))

        if not city_text:
            continue

        records.append(
            {
                "city": city_text,
                "name": name or None,
                "address": address or None,
                "phones": phones or None,
                "cnes": cnes,
                "treatments_raw": treatments_raw or None,
            }
        )

    return records


# City fragments that signal the OCR captured a hospital name in the
# city column by mistake.
_INVALID_CITY_PREFIXES = (
    "hosp",
    "hospital",
    "unidade",
    "upa",
    "samu",
    "posto",
    "santa",
)


def _is_valid_city(text: str) -> bool:
    """Discard records where the city is clearly a fragment of something else."""
    if not text or len(text.strip()) < 3:
        return False
    first_word = text.strip().split()[0].lower().strip(".,")
    if first_word in _INVALID_CITY_PREFIXES:
        return False
    return True


def parse_pdf_ocr(path: str, state_code: str) -> tuple[list[HospitalRecord], float]:
    """
    Parse a scanned PDF via OCR. Returns (records, mean_confidence).

    Output records have the exact same shape as the regular text parser
    (with treatments already normalized to canonical English values).
    Because OCR is noisy, the caller should mark these records as
    `requires_verification` downstream.
    """
    all_confidences: list[float] = []
    records: list[HospitalRecord] = []

    for page in ocr_pdf(path):
        for w in page.words:
            all_confidences.append(w.get("confidence", 0.0))

        for row in _extract_page_ocr(page):
            if not _is_valid_city(row.get("city", "")):
                continue
            records.append(
                {
                    **row,
                    "state_code": state_code,
                    "treatments": normalize_treatments(row["treatments_raw"]),
                }
            )

    mean_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
    return records, mean_confidence


if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m scripts.parsing.ocr_parser <path.pdf> [STATE_CODE]")
        sys.exit(1)
    path = sys.argv[1]
    state_code = sys.argv[2] if len(sys.argv) > 2 else "PI"
    records, confidence = parse_pdf_ocr(path, state_code)
    print(json.dumps(records, ensure_ascii=False, indent=2))
    print(
        f"\n# {len(records)} records, mean confidence: {confidence:.1f}%",
        file=sys.stderr,
    )
