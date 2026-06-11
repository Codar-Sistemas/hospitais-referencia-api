"""
Layout mappers for the three CGCAN oncology spreadsheets.

All mappers are pure functions over a grid (list of rows of cell values)
produced by workbook_reader — independent of the underlying file format
and directly testable with synthetic grids.

Layouts handled:
  - main / synchronous: title row, then
      UF | MUNICÍPIO | MACRORREGIÃO | TOTAL | ESTABELECIMENTO | CNES | CÓDIGO | HABILITAÇÃO
    The main sheet uses merged cells: UF/MUNICÍPIO/MACRORREGIÃO arrive empty
    on follow-up rows of a group -> forward-fill. Columns are matched BY
    HEADER NAME, so the synchronous file (same headers, different order)
    reuses this mapper.
  - isolated radiotherapy (2nd sheet of the main file):
      UF/ | UF/MUNICÍPIO | ESTABELECIMENTO | CNES | CNPJ | CÓDIGO | TIPO | Nº PORTARIA
    The sheet stacks TWO tables: active services, a "TOTAL = N" row, then a
    "DESABILITADOS" section with closed services — parsing STOPS at either
    marker so deactivated establishments never enter the database.
  - breast reconstruction:
      UF | IBGE | MUNICÍPIO | ESTABELECIMENTO | CNES | CNPJ | GESTÃO
      | TIPO (CÓDIGO 17.23) | TIPO (DESCRIÇÃO)
    A handful of rows ship without the code cell -> default to 17.23 (the
    whole file IS the 17.23 list; dropping them silently would lose data).
"""

from __future__ import annotations

import re

from scripts.shared.logger import log
from scripts.shared.spreadsheets import SheetLayoutError, clean_cell, normalize_cnes
from scripts.shared.spreadsheets import normalize_header as _nh
from scripts.syncs.oncology.specialties import extract_codes
from scripts.syncs.oncology.types import OncologyRow
from scripts.syncs.oncology.workbook_reader import read_sheets

_UF_RE = re.compile(r"^[A-Z]{2}$")

SOURCE_KEY_MAIN = "oncology_qualifications"
SOURCE_KEY_BREAST = "breast_reconstruction"
SOURCE_KEY_SYNCHRONOUS = "synchronous_treatment"


def parse_source(content: bytes, source_key: str, source_url: str) -> list[OncologyRow]:
    sheets = read_sheets(content, source_url)

    if source_key == SOURCE_KEY_MAIN:
        main_grid = _find_sheet(sheets, prefix="habilitacao", source_url=source_url)
        radio_grid = _find_sheet(sheets, contains="radioterapia", source_url=source_url)
        rows = map_main_rows(main_grid, source_key, source_url)
        rows += map_isolated_radiotherapy_rows(radio_grid, source_key, source_url)
        return rows

    grid = next(iter(sheets.values()), None)
    if grid is None:
        raise SheetLayoutError(f"No sheets found in {source_url}")

    if source_key == SOURCE_KEY_BREAST:
        return map_breast_reconstruction_rows(grid, source_key, source_url)
    if source_key == SOURCE_KEY_SYNCHRONOUS:
        return map_main_rows(grid, source_key, source_url)
    raise SheetLayoutError(f"Unknown source_key {source_key!r} for {source_url}")


def _find_sheet(
    sheets: dict[str, list[list[object]]],
    source_url: str,
    prefix: str | None = None,
    contains: str | None = None,
) -> list[list[object]]:
    """Sheet names carry dates ('HABILITAÇÃO 2026') — match by normalized
    prefix/substring, never exact name."""
    for name, grid in sheets.items():
        normalized = _nh(name) or ""
        if prefix and normalized.startswith(prefix):
            return grid
        if contains and contains in normalized:
            return grid
    wanted = prefix or contains
    raise SheetLayoutError(f"No sheet matching {wanted!r} in {source_url} (sheets: {list(sheets)})")


# ---------------------------------------------------------------------------
# Header location — shared by all mappers
# ---------------------------------------------------------------------------
def _locate_header(
    grid: list[list[object]],
    required: tuple[str, ...],
    source_url: str,
) -> tuple[int, list[str]]:
    """Index + normalized cells of the first row containing all `required`
    normalized headers (title rows above are skipped naturally)."""
    for idx, row in enumerate(grid):
        normalized = [(_nh(cell) or "") for cell in row]
        if all(any(req == h or h.startswith(req) for h in normalized) for req in required):
            return idx, normalized
    raise SheetLayoutError(f"No header row with {required} found in {source_url}")


def _column(
    headers: list[str],
    source_url: str,
    *,
    equals: str | None = None,
    startswith: str | None = None,
    contains: str | None = None,
    nth: int = 0,
    optional: bool = False,
) -> int | None:
    matches = [
        i
        for i, h in enumerate(headers)
        if (equals is not None and h == equals)
        or (startswith is not None and h.startswith(startswith))
        or (contains is not None and contains in h)
    ]
    if len(matches) > nth:
        return matches[nth]
    if optional:
        return None
    wanted = equals or startswith or contains
    raise SheetLayoutError(f"Column {wanted!r} not found in {source_url} (headers: {headers})")


def _cell(row: list[object], idx: int | None) -> object:
    if idx is None or idx >= len(row):
        return None
    return row[idx]


# ---------------------------------------------------------------------------
# Mappers
# ---------------------------------------------------------------------------
def map_main_rows(grid: list[list[object]], source_key: str, source_url: str) -> list[OncologyRow]:
    hdr_idx, headers = _locate_header(grid, ("uf", "cnes"), source_url)
    col_uf = _column(headers, source_url, equals="uf")
    col_city = _column(headers, source_url, startswith="municipio")
    col_region = _column(headers, source_url, startswith="macrorregiao", optional=True)
    col_name = _column(headers, source_url, startswith="estabelecimento")
    col_cnes = _column(headers, source_url, equals="cnes")
    col_code = _column(headers, source_url, startswith="codigo")
    col_text = _column(headers, source_url, startswith="habilitacao", optional=True)

    rows: list[OncologyRow] = []
    carry_uf: str | None = None
    carry_city: str | None = None
    carry_region: str | None = None

    for row in grid[hdr_idx + 1 :]:
        first = _nh(row[0] if row else None) or ""
        if first.startswith("total") or any((_nh(cell) or "") == "desabilitados" for cell in row):
            break  # footer / closed-services section — never ingest

        # Merged cells: a present value starts a new group; absent inherits.
        uf_cell = clean_cell(_cell(row, col_uf))
        if uf_cell and _UF_RE.match(uf_cell.upper()):
            carry_uf = uf_cell.upper()
            carry_city = None  # new state invalidates the carried city
        city_cell = clean_cell(_cell(row, col_city))
        if city_cell:
            carry_city = city_cell
        region_cell = clean_cell(_cell(row, col_region))
        if region_cell:
            carry_region = region_cell

        cnes_raw = _cell(row, col_cnes)
        if cnes_raw is None:
            continue  # spacer / subtotal / footer rows carry no CNES

        name = clean_cell(_cell(row, col_name))
        text = clean_cell(_cell(row, col_text))
        codes = extract_codes(clean_cell(_cell(row, col_code)) or text)
        if not name or not codes:
            raise SheetLayoutError(f"Establishment row missing name/codes in {source_url}: {row!r}")
        if not carry_uf or not carry_city:
            raise SheetLayoutError(
                f"Establishment row with no UF/city (merge drift?) in {source_url}: {row!r}"
            )

        rows.append(
            {
                "state_code": carry_uf,
                "city": carry_city,
                "region": carry_region,
                "cnes": normalize_cnes(cnes_raw, source_url),
                "name": name,
                "qualification_text_raw": text,
                "qualification_codes": codes,
                "portaria": None,
                "source_key": source_key,
                "source_url": source_url,
            }
        )
    return rows


def map_isolated_radiotherapy_rows(
    grid: list[list[object]], source_key: str, source_url: str
) -> list[OncologyRow]:
    hdr_idx, headers = _locate_header(grid, ("cnes", "estabelecimento"), source_url)
    # First two columns both start with 'uf' ('UF/' and 'UF/MUNICÍPIO').
    col_uf = _column(headers, source_url, startswith="uf")
    col_city = _column(headers, source_url, startswith="uf", nth=1)
    col_name = _column(headers, source_url, startswith="estabelecimento")
    col_cnes = _column(headers, source_url, equals="cnes")
    col_code = _column(headers, source_url, startswith="codigo")
    col_text = _column(headers, source_url, contains="tipo de habilitacao", optional=True)
    col_portaria = _column(headers, source_url, contains="portaria", optional=True)

    rows: list[OncologyRow] = []
    for row in grid[hdr_idx + 1 :]:
        # End of the ACTIVE section: a "TOTAL = N" footer or the
        # "DESABILITADOS" sub-table of closed services. Stop — deactivated
        # establishments must never enter the database.
        first = _nh(row[0] if row else None) or ""
        if first.startswith("total"):
            break
        if any((_nh(cell) or "") == "desabilitados" for cell in row):
            break

        cnes_raw = _cell(row, col_cnes)
        if cnes_raw is None:
            continue
        uf = clean_cell(_cell(row, col_uf))
        city = clean_cell(_cell(row, col_city))
        name = clean_cell(_cell(row, col_name))
        text = clean_cell(_cell(row, col_text))
        codes = extract_codes(clean_cell(_cell(row, col_code)) or text)
        if not uf or not _UF_RE.match(uf.upper()) or not city or not name or not codes:
            raise SheetLayoutError(
                f"Radiotherapy row missing UF/city/name/codes in {source_url}: {row!r}"
            )
        rows.append(
            {
                "state_code": uf.upper(),
                "city": city,
                "region": None,
                "cnes": normalize_cnes(cnes_raw, source_url),
                "name": name,
                "qualification_text_raw": text,
                "qualification_codes": codes,
                "portaria": clean_cell(_cell(row, col_portaria)),
                "source_key": source_key,
                "source_url": source_url,
            }
        )
    return rows


def map_breast_reconstruction_rows(
    grid: list[list[object]], source_key: str, source_url: str
) -> list[OncologyRow]:
    hdr_idx, headers = _locate_header(grid, ("uf", "cnes"), source_url)
    col_uf = _column(headers, source_url, equals="uf")
    col_city = _column(headers, source_url, startswith="municipio")
    col_name = _column(headers, source_url, startswith="estabelecimento")
    col_cnes = _column(headers, source_url, equals="cnes")
    col_code = _column(headers, source_url, contains="codigo", optional=True)
    col_text = _column(headers, source_url, contains="descricao", optional=True)

    rows: list[OncologyRow] = []
    defaulted = 0
    for row in grid[hdr_idx + 1 :]:
        first = _nh(row[0] if row else None) or ""
        if first.startswith("total") or any((_nh(cell) or "") == "desabilitados" for cell in row):
            break  # footer / closed-services section — never ingest

        cnes_raw = _cell(row, col_cnes)
        if cnes_raw is None:
            continue
        uf = clean_cell(_cell(row, col_uf))
        city = clean_cell(_cell(row, col_city))
        name = clean_cell(_cell(row, col_name))
        text = clean_cell(_cell(row, col_text))
        codes = extract_codes(clean_cell(_cell(row, col_code)))
        if not codes:
            # The whole file is the 17.23 list; a few rows ship without the
            # code cell and must not be dropped.
            codes = ["17.23"]
            defaulted += 1
        if not uf or not _UF_RE.match(uf.upper()) or not city or not name:
            raise SheetLayoutError(
                f"Breast-reconstruction row missing UF/city/name in {source_url}: {row!r}"
            )
        rows.append(
            {
                "state_code": uf.upper(),
                "city": city,
                "region": None,
                "cnes": normalize_cnes(cnes_raw, source_url),
                "name": name,
                "qualification_text_raw": text,
                "qualification_codes": codes,
                "portaria": None,
                "source_key": source_key,
                "source_url": source_url,
            }
        )
    if defaulted:
        log(f"breast reconstruction: {defaulted} rows without code cell -> 17.23", state_code="BR")
    return rows
