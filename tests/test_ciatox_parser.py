"""
Unit tests for the CIATOX page parser.

The fixture is the REAL page saved on 2026-07-08 (tests/fixtures/
ciatox_page.html) — it already contains every edge case the parser must
survive: multi-center states (SP=9, PR=4, PB=2), a center with no
"Telefone:" line (SE), stray spaces inside area codes ("(14 )" in Botucatu),
the label's trailing space inside <strong> (São José do Rio Preto) and
annotations riding with the numbers ("Ramal", "whatsapp").
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.shared.config import BRAZIL_STATE_CODES
from scripts.syncs.ciatox.parser import (
    normalize_phone,
    parse_ciatox_page,
    split_phone_list,
)

FIXTURE = Path(__file__).parent / "fixtures" / "ciatox_page.html"


def _parse():
    return parse_ciatox_page(FIXTURE.read_text(encoding="utf-8"))


def by_state(records, state_code):
    return [r for r in records if r["state_code"] == state_code]


# ---------------------------------------------------------------------------
# Whole-page shape
# ---------------------------------------------------------------------------
def test_parses_full_page():
    records = _parse()
    assert len(records) >= 30, f"expected 30+ centers, got {len(records)}"

    states = {r["state_code"] for r in records}
    assert states <= BRAZIL_STATE_CODES
    # Snapshot of 2026-07-08: 20 UFs listed.
    assert len(states) >= 18

    for r in records:
        assert r["name"], r
        # Every center published on the snapshot has an emergency number.
        assert r["emergency_phone"], r
        assert r["emergency_phone"] not in r["phones"], r


def test_no_duplicate_center_keys():
    records = _parse()
    keys = [(r["state_code"], r["name"]) for r in records]
    assert len(keys) == len(set(keys))


# ---------------------------------------------------------------------------
# Known real centers
# ---------------------------------------------------------------------------
def test_piaui_single_center():
    (pi,) = by_state(_parse(), "PI")
    assert pi["name"] == "Centro de Informações Toxicológicas – CITOX do Piauí"
    assert pi["emergency_phone"] == "0800-280-3661"
    assert pi["phones"] == ["(86) 981788257"]


def test_amazonas_dedupes_emergency_number_from_phone_list():
    (am,) = by_state(_parse(), "AM")
    assert am["emergency_phone"] == "(92) 3305-4702"
    # (92) 3305-4702 appears again in the "Telefone:" line — deduped; the
    # secondary emergency number is preserved ahead of the regular ones.
    assert am["phones"] == ["0800-722-6001", "(92) 3305-4732"]


def test_goias_multiple_emergency_numbers():
    (go,) = by_state(_parse(), "GO")
    assert go["emergency_phone"] == "0800-646-4350"
    assert "(62) 3241-2723" in go["phones"]
    assert "(62) 3287-2778" in go["phones"]


def test_sergipe_center_without_phone_line():
    (se,) = by_state(_parse(), "SE")
    assert se["emergency_phone"] == "0800-722-6001"
    assert se["phones"] == []


def test_paraiba_two_centers_in_page_order():
    pb = by_state(_parse(), "PB")
    assert [r["name"] for r in pb] == [
        "Centro de Informação e Assistência Toxicológica – CIATox de Campina Grande",
        "Centro de Informação e Assistência Toxicológica – CIATOX de João Pessoa",
    ]
    # Annotation preserved — the extension matters to callers.
    assert pb[0]["phones"] == ["(83) 3310-5850 (Ramal 5853)"]


def test_sao_paulo_nine_centers():
    sp = by_state(_parse(), "SP")
    assert len(sp) == 9
    botucatu = next(r for r in sp if "Botucatu" in r["name"])
    # Source publishes "(14 ) 3880-0673" — the area code is repaired.
    assert botucatu["emergency_phone"] == "(14) 3880-0673"
    # Label with the trailing space inside <strong> still parses as a label.
    rio_preto = next(r for r in sp if "Rio Preto" in r["name"])
    assert rio_preto["emergency_phone"] == "(17) 3201-5175"


def test_rn_whatsapp_annotation_preserved():
    (rn,) = by_state(_parse(), "RN")
    assert rn["emergency_phone"] == "0800-281-7005"
    assert any("whatsapp" in p for p in rn["phones"])


# ---------------------------------------------------------------------------
# Normalization units
# ---------------------------------------------------------------------------
def test_normalize_phone_repairs_area_code_spacing():
    assert normalize_phone("(14 ) 3880-0673") == "(14) 3880-0673"
    assert normalize_phone("( 62 )  3241-2723 ") == "(62) 3241-2723"


def test_split_phone_list_drops_digitless_noise():
    assert split_phone_list("(85) 3255-5050 / ") == ["(85) 3255-5050"]
    assert split_phone_list("0800 722 6001 / (91) 3249-6370") == [
        "0800 722 6001",
        "(91) 3249-6370",
    ]


def test_unknown_uf_heading_is_skipped():
    html = """
    <div id="content-core"><ul><li>
      <a class="toggle">Atlântida (XX)</a>
      <div class="conteudo"><p><strong>Centro Fantasma</strong><br/>
      <strong>Telefone Emergência:</strong> 0800-000-0000</p></div>
    </li></ul></div>
    """
    assert parse_ciatox_page(html) == []


# ---------------------------------------------------------------------------
# CI entry point (`python -m tests.test_ciatox_parser`, see tests.yml).
# The functions above are also plain pytest tests.
# ---------------------------------------------------------------------------
def main() -> None:
    import traceback

    tests = [
        (name, fn)
        for name, fn in sorted(globals().items())
        if name.startswith("test_") and callable(fn)
    ]
    failures = 0
    for name, fn in tests:
        try:
            fn()
            print(f"✓ {name}")
        except Exception:
            failures += 1
            print(f"✗ {name}")
            traceback.print_exc()

    print(f"\nResult: {len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
