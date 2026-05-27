"""Unit tests for the LLM extractor — pure helpers, no network."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.shared.llm_extractor.metrics import compute_extraction_confidence
from scripts.shared.llm_extractor.pipeline import _strip_code_fences


def _row(**overrides):
    """Build a HospitalRecord-shaped dict with permissive defaults."""
    return {
        "state_code": "SP",
        "city": "São Paulo",
        "name": "Hospital",
        "address": "Rua X, 10",
        "phones": "(11) 4411-0062",
        "cnes": "2078015",
        "treatments_raw": "Botrópico",
        "treatments": ["Bothropic"],
        **overrides,
    }


def test_confidence_perfect_records():
    """Every signal at 100% → score in the high 90s."""
    records = [_row() for _ in range(5)]
    score = compute_extraction_confidence(records)
    assert score == 100, f"expected 100, got {score}"
    print(f"✓ Perfect records → {score}")


def test_confidence_no_records():
    """No records means we never trust the result."""
    assert compute_extraction_confidence([]) == 0
    print("✓ Empty result → 0")


def test_confidence_missing_cnes():
    """Half the rows without CNES — score drops by ~30/2 = 15 points."""
    records = [_row() for _ in range(2)] + [_row(cnes=None) for _ in range(2)]
    score = compute_extraction_confidence(records)
    expected = 100 - 15
    assert score == expected, f"expected {expected}, got {score}"
    print(f"✓ Half missing CNES → {score} (expected {expected})")


def test_confidence_unknown_treatments():
    """Treatments empty (LLM hallucinated names) drops ~30 points."""
    records = [_row(treatments=[]) for _ in range(3)]
    score = compute_extraction_confidence(records)
    # cnes(30) + name(25) + address(15) = 70
    assert score == 70, f"expected 70, got {score}"
    print(f"✓ No canonical treatments → {score}")


def test_confidence_drops_below_70_when_multiple_signals_fail():
    """Realistic 'bad' extraction: half-broken CNES, half missing names,
    no treatments. Should fall below the 70-threshold."""
    records = [_row(cnes=None, treatments=[]) for _ in range(2)] + [
        _row(name=None, treatments=[]) for _ in range(2)
    ]
    score = compute_extraction_confidence(records)
    assert score < 70, f"expected < 70 (manual-verification regime), got {score}"
    print(f"✓ Multiple weak signals → {score} (correctly flagged)")


def test_strip_code_fences_passthrough():
    raw = '{"rows":[]}'
    assert _strip_code_fences(raw) == raw


def test_strip_code_fences_with_language_tag():
    raw = '```json\n{"rows":[]}\n```'
    assert _strip_code_fences(raw) == '{"rows":[]}'


def test_strip_code_fences_without_language_tag():
    raw = '```\n{"rows":[]}\n```'
    assert _strip_code_fences(raw) == '{"rows":[]}'


def main():
    test_confidence_perfect_records()
    test_confidence_no_records()
    test_confidence_missing_cnes()
    test_confidence_unknown_treatments()
    test_confidence_drops_below_70_when_multiple_signals_fail()
    test_strip_code_fences_passthrough()
    test_strip_code_fences_with_language_tag()
    test_strip_code_fences_without_language_tag()
    print("\nAll LLM extractor tests passed.")


if __name__ == "__main__":
    main()
