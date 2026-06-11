"""
Unit tests for the oncology workbook reader + layout mappers.

The mappers are pure functions over grids, so most cases use synthetic
list-of-lists fixtures (the .xls format itself is exercised via magic-byte
sniffing — generating real BIFF in a test would require a dead dependency).
The XLSX path is exercised end-to-end with an in-memory openpyxl workbook.
"""

import sys
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openpyxl import Workbook

from scripts.shared.spreadsheets import SheetLayoutError
from scripts.syncs.oncology.workbook_reader import detect_format
from scripts.syncs.oncology.xlsx_parser import (
    map_breast_reconstruction_rows,
    map_isolated_radiotherapy_rows,
    map_main_rows,
    parse_source,
)

URL = "https://example.org/onco.xlsx"

MAIN_GRID: list[list[object]] = [
    ["HOSPITAIS HABILITADOS EM ONCOLOGIA", None, None, None, None, None, None, None],
    [
        "UF",
        "MUNICÍPIO",
        "MACRORREGIÃO DE SAÚDE",
        "TOTAL DE HABILITAÇÕES",
        "ESTABELECIMENTO",
        "CNES",
        "CÓDIGO ",
        "HABILITAÇÃO",
    ],
    [
        "AL",
        "Arapiraca",
        "2ª Macro",
        1.0,
        "Complexo Hospitalar",
        2005417.0,
        "17.07",
        "UNACON com RT",
    ],
    # Merged cells: UF empty (same state), city present.
    [None, "Maceió", "1ª Macro", 1.0, "Hospital Santa Casa", 2007037.0, "17.13", "CACON"],
    # Both UF and city empty — inherits Maceió.
    [None, None, None, 1.0, "Hospital Universitário", 2006197.0, "17.06 e 17.08", "UNACON Hemato"],
    # Spacer row.
    [None] * 8,
    # Footer — must stop parsing.
    ["TOTAL = 3 HABILITAÇÕES", None, None, None, None, None, None, None],
    ["XX", "Fantasma", "Macro", 1.0, "Nunca Parseado", 9999999.0, "17.06", "UNACON"],
]

RADIO_GRID: list[list[object]] = [
    [None] * 16,
    [
        "UF/",
        "UF/MUNICÍPIO",
        "ESTABELECIMENTO",
        "CNES",
        "CNPJ",
        "CÓDIGO ",
        "TIPO DE HABILITAÇÃO (DESCRIÇÃO)",
        "Nº PORTARIA DE HABILITAÇÃO",
        None,
        None,
        None,
        None,
        "ANO DA PRIMEIRA",
        "CÓGIGOS HABILITADOS",
        "ANO DA ALTERAÇÃO",
        "CÓDIGOS HABILITADOS",
    ],
    [
        "PE",
        "Recife",
        "Instituto de Radium",
        "0001023",
        "11.387.412/0001-42",
        "17.04",
        "Serviço Isolado de Radioterapia",
        "SAS 618, DE 26/09/2199",
        None,
        None,
        None,
        None,
        1999.0,
        "17.04",
        None,
        None,
    ],
    ["TOTAL = 01 SERVIÇO", *[None] * 15],
    [None, "DESABILITADOS", *[None] * 14],
    # Closed service — must never be parsed.
    [
        "RJ",
        "Niterói",
        "Serviço Encerrado",
        2272962.0,
        "30.060.248/0001-00",
        "17.04",
        "Serviço Isolado",
        None,
        *[None] * 8,
    ],
]

BREAST_GRID: list[list[object]] = [
    [
        "UF",
        "IBGE",
        "MUNICÍPIO",
        "ESTABELECIMENTO",
        "CNES  ",
        "CNPJ  ",
        "GESTÃO",
        "TIPO DE HABILITAÇÃO (CÓDIGO)",
        "TIPO DE HABILITAÇÃO (DESCRIÇÃO)",
    ],
    [
        "BA ",
        292740,
        "SALVADOR",
        "HOSPITAL ARISTIDES",
        "0003786",
        "15.180...",
        "MUNICIPAL",
        "17.23",
        "Reconstrução",
    ],
    # Row without the code cell — must default to 17.23, not be dropped.
    [
        "CE",
        230440,
        "FORTALEZA",
        "HGF HOSPITAL GERAL",
        "2497654",
        "07.954...",
        "MUNICIPAL",
        None,
        None,
    ],
]


def check(desc, condition, detail=""):
    if condition:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}{f' — {detail}' if detail else ''}")
    return False


def main():
    results = []

    # ------------------------------------------------------------------
    # Format sniffing
    # ------------------------------------------------------------------
    results.append(
        check(
            "BIFF magic -> xls",
            detect_format(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 8) == "xls",
        )
    )
    results.append(check("ZIP magic -> xlsx", detect_format(b"PK\x03\x04rest") == "xlsx"))
    try:
        detect_format(b"GARBAGE!")
        results.append(check("unknown magic raises", False))
    except SheetLayoutError:
        results.append(check("unknown magic raises", True))

    # ------------------------------------------------------------------
    # Main sheet mapper: forward-fill + multi-code + footer stop
    # ------------------------------------------------------------------
    rows = map_main_rows(MAIN_GRID, "oncology_qualifications", URL)
    results.append(check("3 establishments (footer stopped)", len(rows) == 3, f"got {len(rows)}"))
    results.append(check("CNES from float", rows[0]["cnes"] == "2005417", rows[0]["cnes"]))
    results.append(
        check("UF forward-filled", rows[1]["state_code"] == "AL" and rows[2]["state_code"] == "AL")
    )
    results.append(check("city forward-filled", rows[2]["city"] == "Maceió", rows[2]["city"]))
    results.append(
        check(
            "multi-code cell extracted",
            rows[2]["qualification_codes"] == ["17.06", "17.08"],
            str(rows[2]["qualification_codes"]),
        )
    )

    # ------------------------------------------------------------------
    # Isolated radiotherapy: portaria captured, closed section skipped
    # ------------------------------------------------------------------
    rows = map_isolated_radiotherapy_rows(RADIO_GRID, "oncology_qualifications", URL)
    results.append(check("only active services parsed", len(rows) == 1, f"got {len(rows)}"))
    results.append(
        check(
            "portaria captured raw",
            rows[0]["portaria"] == "SAS 618, DE 26/09/2199",
            str(rows[0]["portaria"]),
        )
    )
    results.append(check("zero-padded CNES kept", rows[0]["cnes"] == "0001023"))

    # ------------------------------------------------------------------
    # Breast reconstruction: missing code defaults to 17.23
    # ------------------------------------------------------------------
    rows = map_breast_reconstruction_rows(BREAST_GRID, "breast_reconstruction", URL)
    results.append(check("both rows parsed", len(rows) == 2, f"got {len(rows)}"))
    results.append(check("UF trailing space cleaned", rows[0]["state_code"] == "BA"))
    results.append(
        check(
            "missing code defaults to 17.23",
            rows[1]["qualification_codes"] == ["17.23"],
            str(rows[1]["qualification_codes"]),
        )
    )

    # ------------------------------------------------------------------
    # XLSX end-to-end (in-memory workbook through parse_source)
    # ------------------------------------------------------------------
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    xlsx_rows: list[list[object]] = [
        ["TRATAMENTOS SINCRÔNICOS", *[None] * 7],
        [
            "TOTAL DE HABILITAÇÕES",
            "UF",
            "MUNICÍPIO",
            "MACRO",
            "ESTABELECIMENTO",
            "CNES",
            "CÓDIGO",
            "HABILITAÇÃO",
        ],
        [
            1,
            "BA",
            "Salvador",
            "Leste",
            "Hospital Aristides",
            "0003786",
            "17.22",
            "TRATAMENTOS INTEGRADOS",
        ],
    ]
    for row in xlsx_rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    rows = parse_source(buffer.getvalue(), "synchronous_treatment", URL)
    results.append(check("xlsx path end-to-end", len(rows) == 1 and rows[0]["cnes"] == "0003786"))
    results.append(
        check(
            "synchronous reuses main mapper (header by name)",
            rows[0]["state_code"] == "BA" and rows[0]["qualification_codes"] == ["17.22"],
        )
    )

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
