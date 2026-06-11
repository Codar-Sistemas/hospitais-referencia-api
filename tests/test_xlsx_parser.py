"""
Unit tests for the rare-diseases XLSX parser.

The fixture workbook is generated in-memory with openpyxl instead of a
versioned binary: the test then doubles as living documentation of the
gov.br layout (header row, continuation rows, numeric CNES cells).
"""

import sys
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openpyxl import Workbook

from scripts.syncs.rare_diseases.xlsx_parser import XlsxLayoutError, parse_xlsx

SOURCE_URL = "https://example.org/servicos-habilitados.xlsx"

HEADER = [
    "UF",
    "Município",
    "Região",
    "CNES ",  # trailing space on purpose — the real file has it
    "Estabelecimento",
    "Tipo da Habilitação",
    "Ano da Habilitação",
    "Códigos Habilitados",
]


def build_fixture(rows):
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None  # a fresh Workbook always has an active sheet
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def check(desc, condition, detail=""):
    if condition:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}{f' — {detail}' if detail else ''}")
    return False


def main():
    results = []

    # ------------------------------------------------------------------
    # Happy path: title row above the header, blank spacer rows, an
    # establishment spanning two continuation rows, CNES as bare int.
    # ------------------------------------------------------------------
    content = build_fixture(
        [
            ["Serviços habilitados — Doenças Raras", *[None] * 7],
            HEADER,
            [None] * 8,
            [
                "BA",
                "Salvador",
                "Nordeste",
                4529,  # numeric cell, no leading zeros
                "APAE Salvador",
                "Serviço de Referência em Doenças Raras",
                2018,
                "35.07- Serviço de Referência em Doenças Raras",
            ],
            # Continuation rows: only the codes column is filled.
            [None, None, None, None, None, None, None, "35.08- Anomalias Congênitas"],
            [None, None, None, None, None, None, None, "35.09- Doenças Metabólicas"],
            [
                "SP",
                "Campinas",
                "Sudeste",
                "2079798",
                "HC Unicamp",
                "Serviço de Atenção Especializada em Doenças Raras e "
                "Serviço de Referência em Doenças Raras",
                2025,
                "35.16 - Terapia gênica",
            ],
            [None] * 8,
        ]
    )
    rows = parse_xlsx(content, SOURCE_URL)

    results.append(check("two establishments parsed", len(rows) == 2, f"got {len(rows)}"))

    apae = rows[0]
    results.append(check("CNES zero-padded from int", apae["cnes"] == "0004529", apae["cnes"]))
    results.append(
        check(
            "continuation codes folded into parent",
            len(apae["qualification_codes"]) == 3,
            str(apae["qualification_codes"]),
        )
    )
    results.append(check("year parsed as int", apae["qualification_year"] == 2018))
    results.append(check("state upper-cased", apae["state_code"] == "BA"))
    results.append(check("source url attached", apae["source_url"] == SOURCE_URL))

    unicamp = rows[1]
    results.append(check("string CNES kept", unicamp["cnes"] == "2079798", unicamp["cnes"]))
    results.append(
        check(
            "combined qualification type preserved raw",
            "Atenção Especializada" in unicamp["qualification_type_raw"]
            and "Referência" in unicamp["qualification_type_raw"],
        )
    )

    # ------------------------------------------------------------------
    # Reordered columns still map correctly (header-name based).
    # ------------------------------------------------------------------
    reordered_header = [HEADER[4], HEADER[0], HEADER[1], HEADER[2], HEADER[3], *HEADER[5:]]
    content = build_fixture(
        [
            reordered_header,
            [
                "Hospital X",
                "CE",
                "Fortaleza",
                "Nordeste",
                "0011223",
                "Serviço de Terapia Gênica",
                2024,
                "35.16",
            ],
        ]
    )
    rows = parse_xlsx(content, SOURCE_URL)
    results.append(
        check(
            "columns mapped by name, not position",
            rows[0]["name"] == "Hospital X" and rows[0]["state_code"] == "CE",
            str(rows[0]),
        )
    )

    # ------------------------------------------------------------------
    # Failure modes are loud, never silent.
    # ------------------------------------------------------------------
    try:
        parse_xlsx(build_fixture([["foo", "bar"]]), SOURCE_URL)
        results.append(check("missing header raises", False))
    except XlsxLayoutError:
        results.append(check("missing header raises", True))

    try:
        parse_xlsx(
            build_fixture([HEADER, [None, None, None, None, None, None, None, "35.08 órfão"]]),
            SOURCE_URL,
        )
        results.append(check("orphan continuation row raises", False))
    except XlsxLayoutError:
        results.append(check("orphan continuation row raises", True))

    try:
        parse_xlsx(
            build_fixture(
                [HEADER, ["XX9", "Cidade", "Região", "123", "Nome", "Tipo", 2020, "35.x"]]
            ),
            SOURCE_URL,
        )
        results.append(check("invalid UF raises", False))
    except XlsxLayoutError:
        results.append(check("invalid UF raises", True))

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
