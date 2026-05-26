"""
Smoke test for the PDF parser using a real SP PDF.

Run: cd hospitais-referencia-api && python -m tests.test_parser [optional pdf path]

If no PDF path is supplied and the default /home/claude/sp.pdf is missing,
the test is skipped (exit 0) so CI does not fail when run in environments
without the fixture.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.parsing.text_parser import TREATMENT_TYPES, parse_pdf


def test_sp(pdf_path: str):
    if not Path(pdf_path).exists():
        print(f"PDF fixture not found: {pdf_path} — skipping smoke test.")
        return

    print(f"Parsing {pdf_path} ...")
    records = parse_pdf(pdf_path, state_code="SP")

    assert len(records) > 200, f"Expected 200+ records, got {len(records)}"
    print(f"✓ {len(records)} records")

    for record in records:
        assert record["city"], f"Record without city: {record}"
        assert record["name"], f"Record without name: {record}"
        assert record["state_code"] == "SP"
        assert isinstance(record["treatments"], list)
    print("✓ All records have city, name and state_code")

    # Canonical treatment values are persisted in English.
    all_treatments: set[str] = set()
    for record in records:
        for treatment in record["treatments"]:
            all_treatments.add(treatment)
    for treatment in all_treatments:
        assert treatment in TREATMENT_TYPES, f"Unknown treatment: {treatment}"
    print(f"✓ Distinct treatments found: {sorted(all_treatments)}")

    adamantina = next(r for r in records if r["city"] == "Adamantina")
    assert "Santa Casa" in adamantina["name"]
    assert "Bothropic" in adamantina["treatments"]
    print(f"✓ Adamantina OK: {adamantina['name']}")

    # Botucatu is one of the few cities listing all 8 treatments.
    botucatu = next(r for r in records if r["city"] == "Botucatu")
    assert "Lachetic" in botucatu["treatments"], (
        f"Botucatu should include Lachetic: {botucatu['treatments']}"
    )
    print(f"✓ Botucatu OK: {len(botucatu['treatments'])} treatments")

    from collections import Counter

    counter = Counter(r["city"] for r in records)
    multi = {city: n for city, n in counter.items() if n > 1}
    print(
        f"✓ Cities with multiple units: {len(multi)} "
        f"(e.g. Bauru={counter['Bauru']}, Campinas={counter['Campinas']}, "
        f"São Paulo={counter['São Paulo']})"
    )

    print(f"\n✅ All tests passed. Total: {len(records)} hospitals in SP.")


if __name__ == "__main__":
    pdf = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/sp.pdf"
    test_sp(pdf)
