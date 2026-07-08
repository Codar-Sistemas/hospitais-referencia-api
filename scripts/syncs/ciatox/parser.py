"""
Parser for the official CIATOX page (Plone accordion HTML).

Source structure, per state:

    <li>
      <a class="toggle">Amazonas (AM)</a>
      <div class="conteudo">
        <p><strong>Centro ... – CIT/AM</strong><br/>
           <strong>Telefone Emergência:</strong> (92) 3305-4702 / 0800-722-6001<br/>
           <strong>Telefone:</strong> (92) 3305-4702 / (92) 3305-4732</p>
        <!-- multi-center states repeat the <p> block (SP has 9, PR 4, PB 2) -->
      </div>
    </li>

The markup is hand-maintained and dirty: labels sometimes carry the trailing
space INSIDE the <strong>, area codes appear as "(14 )", a center may have no
"Telefone:" line at all (SE), and annotations like "(Ramal 5853)" or
"(whatsapp)" ride along with the numbers. The parser therefore works on the
flattened text lines of each <p> (one line per <br>), not on tag positions,
and validates every UF against the canonical 27 before trusting it.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from bs4 import BeautifulSoup

from scripts.shared.config import BRAZIL_STATE_CODES
from scripts.shared.logger import log
from scripts.syncs.ciatox.types import CiatoxCenterRecord

# State headings look like "São Paulo (SP)" — the UF in parentheses at the end.
RE_STATE_HEADING = re.compile(r"\(([A-Za-z]{2})\)\s*$")

# Area code with stray spaces: "(14 )", "( 14)" → "(14)".
RE_AREA_CODE_SPACES = re.compile(r"\(\s*(\d+)\s*\)")


def parse_ciatox_page(html: str) -> list[CiatoxCenterRecord]:
    """Extract every toxicology center from the CIATOX page HTML.

    Returns records in page order. States whose heading does not carry a
    valid UF are skipped (logged), never guessed.
    """
    soup = BeautifulSoup(html, "html.parser")
    # Scope to the Plone content area when present so navigation/footer
    # anchors never look like state headings.
    root = soup.find(id="content-core") or soup

    records: list[CiatoxCenterRecord] = []
    for anchor in root.find_all("a"):
        heading = anchor.get_text(" ", strip=True)
        match = RE_STATE_HEADING.search(heading)
        if not match:
            continue
        state_code = match.group(1).upper()
        if state_code not in BRAZIL_STATE_CODES:
            log(f"CIATOX: ignoring heading with unknown UF: {heading!r}")
            continue
        content = _content_block_for(anchor)
        if content is None:
            log(f"CIATOX: no content block after heading {heading!r}", state_code=state_code)
            continue
        records.extend(_parse_state_block(content, state_code))

    return _merge_duplicates(records)


# ---------------------------------------------------------------------------
# Per-state block
# ---------------------------------------------------------------------------
def _content_block_for(anchor: Any) -> Any | None:
    """The <div class="conteudo"> that belongs to a state heading — the
    anchor's sibling in the same <li> (fallback: anywhere in the parent)."""
    sibling = anchor.find_next_sibling("div", class_="conteudo")
    if sibling is not None:
        return sibling
    parent = anchor.parent
    if parent is not None:
        return parent.find("div", class_="conteudo")
    return None


def _parse_state_block(content: Any, state_code: str) -> list[CiatoxCenterRecord]:
    """Walk the flattened text lines of the block, one center at a time.

    A line is either a label line ("Telefone Emergência: …" / "Telefone: …")
    or a center name (anything else non-empty). A name line closes the
    previous center and opens the next — this also survives the case where
    several centers share a single <p>.
    """
    centers: list[CiatoxCenterRecord] = []
    name: str | None = None
    emergency_raw: str | None = None
    phones_raw: list[str] = []
    # A label whose value did not fit on the same line (value after the ':'
    # is empty); the next non-label line is its value, not a center name.
    pending_label: str | None = None

    def flush() -> None:
        nonlocal name, emergency_raw, phones_raw
        if name:
            centers.append(_build_record(state_code, name, emergency_raw, phones_raw))
        name = None
        emergency_raw = None
        phones_raw = []

    for line in _text_lines(content):
        label, value = _split_label(line)
        if label == "emergency":
            if value:
                emergency_raw = value
            else:
                pending_label = "emergency"
            continue
        if label == "phone":
            if value:
                phones_raw.append(value)
            else:
                pending_label = "phone"
            continue
        if pending_label is not None:
            if pending_label == "emergency":
                emergency_raw = line
            else:
                phones_raw.append(line)
            pending_label = None
            continue
        # A new center name.
        flush()
        name = line.strip(" -–—")

    flush()
    return centers


def _text_lines(content: Any) -> list[str]:
    """Flatten the block into visual lines: each <br> and each <p> boundary
    becomes a line break; <strong> boundaries do not."""
    for br in content.find_all("br"):
        br.replace_with("\n")
    chunks = [p.get_text() for p in content.find_all("p")] or [content.get_text()]
    lines: list[str] = []
    for chunk in chunks:
        lines.extend(re.sub(r"\s+", " ", raw).strip() for raw in chunk.split("\n") if raw.strip())
    return lines


def _split_label(line: str) -> tuple[str | None, str]:
    """Classify a line as ('emergency'|'phone'|None, value-after-colon)."""
    folded = _fold(line)
    if folded.startswith("telefone emerg"):
        return "emergency", _value_after_colon(line)
    if folded.startswith("telefone"):
        return "phone", _value_after_colon(line)
    return None, ""


def _value_after_colon(line: str) -> str:
    _, _, value = line.partition(":")
    return value.strip()


def _fold(text: str) -> str:
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return stripped.lower()


# ---------------------------------------------------------------------------
# Phone normalization
# ---------------------------------------------------------------------------
def _build_record(
    state_code: str,
    name: str,
    emergency_raw: str | None,
    phones_raw: list[str],
) -> CiatoxCenterRecord:
    emergency_numbers = split_phone_list(emergency_raw) if emergency_raw else []
    emergency_phone = emergency_numbers[0] if emergency_numbers else None

    phones: list[str] = []
    for number in emergency_numbers[1:] + [n for raw in phones_raw for n in split_phone_list(raw)]:
        if number != emergency_phone and number not in phones:
            phones.append(number)

    return {
        "state_code": state_code,
        "name": name,
        "emergency_phone": emergency_phone,
        "phones": phones,
    }


def split_phone_list(value: str) -> list[str]:
    """Split a published phone line ("(92) 3305-4702 / 0800-722-6001") into
    normalized individual numbers. Segments without digits are noise."""
    parts = (normalize_phone(part) for part in value.split("/"))
    return [part for part in parts if any(ch.isdigit() for ch in part)]


def normalize_phone(raw: str) -> str:
    """Display-format cleanup only — collapse whitespace and fix stray
    spaces inside the area code. Annotations ("Ramal 5853", "whatsapp")
    are preserved: callers need them."""
    text = re.sub(r"\s+", " ", raw).strip(" .,;-–—")
    return RE_AREA_CODE_SPACES.sub(r"(\1)", text)


def _merge_duplicates(records: list[CiatoxCenterRecord]) -> list[CiatoxCenterRecord]:
    """The upsert key is (state_code, name) — if the page ever repeats a
    center, merge the phone lists instead of tripping the DB upsert."""
    merged: dict[tuple[str, str], CiatoxCenterRecord] = {}
    for record in records:
        key = (record["state_code"], record["name"])
        existing = merged.get(key)
        if existing is None:
            merged[key] = record
            continue
        if existing["emergency_phone"] is None:
            existing["emergency_phone"] = record["emergency_phone"]
        for number in record["phones"]:
            if number != existing["emergency_phone"] and number not in existing["phones"]:
                existing["phones"].append(number)
    return list(merged.values())
