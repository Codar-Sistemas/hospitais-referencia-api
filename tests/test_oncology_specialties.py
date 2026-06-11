"""
Unit tests for the oncology 17.XX code extraction and specialty mapping.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.syncs.oncology.specialties import (
    SPECIALTY_BREAST_RECONSTRUCTION,
    SPECIALTY_CACON,
    SPECIALTY_ISOLATED_RADIOTHERAPY,
    SPECIALTY_RADIOTHERAPY_COMPLEX,
    SPECIALTY_UNACON,
    UnknownQualificationCodeError,
    extract_codes,
    map_codes,
)


def check(desc, got, expected):
    if got == expected:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}")
    print(f"       expected: {expected}")
    print(f"       got:      {got}")
    return False


def main():
    results = [
        check("single code", extract_codes("17.07"), ["17.07"]),
        check(
            "multi-code cell (real format)",
            extract_codes("17.07, 17.08 e 17.09"),
            ["17.07", "17.08", "17.09"],
        ),
        check(
            "uppercase E separator",
            extract_codes("17.07, 17.08 E 17.09"),
            ["17.07", "17.08", "17.09"],
        ),
        check("dot-less variant", extract_codes("1723"), ["17.23"]),
        check("spaced variant", extract_codes("17. 04"), ["17.04"]),
        check("dedupe", extract_codes("17.04 e 17.04"), ["17.04"]),
        check("empty / None", extract_codes(None), []),
        check("no codes in text", extract_codes("Hospital Geral"), []),
        check(
            "UNACON variants collapse to one key",
            map_codes(["17.07", "17.08", "17.09"]),
            [SPECIALTY_UNACON],
        ),
        check("CACON", map_codes(["17.12"]), [SPECIALTY_CACON]),
        check(
            "CACON pediátrico still cacon",
            map_codes(["17.13"]),
            [SPECIALTY_CACON],
        ),
        check(
            "complexo: radioterapia + onco clínica",
            map_codes(["17.15", "17.16"]),
            [SPECIALTY_RADIOTHERAPY_COMPLEX],
        ),
        check(
            "isolated radiotherapy",
            map_codes(["17.04"]),
            [SPECIALTY_ISOLATED_RADIOTHERAPY],
        ),
        check(
            "breast reconstruction",
            map_codes(["17.23"]),
            [SPECIALTY_BREAST_RECONSTRUCTION],
        ),
    ]

    try:
        map_codes(["17.99"])
        print("  ✗ unknown code raises")
        results.append(False)
    except UnknownQualificationCodeError:
        print("  ✓ unknown code raises")
        results.append(True)

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
