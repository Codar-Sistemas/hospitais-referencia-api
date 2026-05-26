"""
Unit tests for normalize_treatments — covers real cases observed in PDFs
from several Brazilian states.

Input strings stay Portuguese (that's how the source PDFs are written);
output values are the English canonical names persisted to the database.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.parsing.text_parser import normalize_treatments


def check(desc, input_text, expected):
    result = normalize_treatments(input_text)
    result_set = set(result)
    expected_set = set(expected)
    if result_set == expected_set:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}")
    print(f"       input:    {input_text!r}")
    print(f"       expected: {sorted(expected_set)}")
    print(f"       got:      {sorted(result_set)}")
    return False


def main():
    print("Cases from SP:")
    cases_sp = [
        (
            "complete list with accents",
            "Botrópico, Crotálico, Loxoscélico, Fonêutrico e Escorpiônico.",
            ["Bothropic", "Crotalic", "Loxoscelic", "Phoneutric", "Scorpionic"],
        ),
        (
            "Botucatu (all 8)",
            "Botrópico, Crotálico, Elapídico, Laquético, Escorpiônico, "
            "Loxoscélico, Fonêutrico e Lonômico",
            [
                "Bothropic",
                "Crotalic",
                "Elapidic",
                "Lachetic",
                "Scorpionic",
                "Loxoscelic",
                "Phoneutric",
                "Lonomic",
            ],
        ),
        ("only Scorpionic", "Escorpiônico", ["Scorpionic"]),
        (
            "ITAPOLIS uppercase",
            "BOTRÓPICO, CROTÁLICO, Loxoscélico, Fonêutrico E ESCORPIÔNICO",
            ["Bothropic", "Crotalic", "Loxoscelic", "Phoneutric", "Scorpionic"],
        ),
    ]

    print("\nCases from MG:")
    cases_mg = [
        (
            "Phoneutric without accent",
            "Botrópico, Escorpiônico, Loxoscélico e Fonêutrico",
            ["Bothropic", "Scorpionic", "Loxoscelic", "Phoneutric"],
        ),
        (
            "Uberaba: Bothropic-Crotalic composite",
            "Botrópico, Crotálico, Botrópico-Crotálico, Elapídico, "
            "Escorpiônico, Loxoscélico, Fonêutrico e Lonômico",
            [
                "Bothropic",
                "Crotalic",
                "Elapidic",
                "Scorpionic",
                "Loxoscelic",
                "Phoneutric",
                "Lonomic",
            ],
        ),
        (
            "Uberlândia: list with Lachetic",
            "Botrópico, Crotálico, Elapídico, Laquético, Escorpiônico, "
            "Loxoscélico, Fonêutrico e Lonômico",
            [
                "Bothropic",
                "Crotalic",
                "Elapidic",
                "Lachetic",
                "Scorpionic",
                "Loxoscelic",
                "Phoneutric",
                "Lonomic",
            ],
        ),
        ("Teófilo Otoni: only Bothropic", "Botrópico", ["Bothropic"]),
    ]

    print("\nEdge cases:")
    cases_edge = [
        ("empty", "", []),
        ("None", None, []),
        ("text without valid types", "Hospital aberto 24h", []),
        ("only punctuation", ",,,", []),
    ]

    total = 0
    ok = 0
    for group in (cases_sp, cases_mg, cases_edge):
        for desc, input_text, expected in group:
            total += 1
            if check(desc, input_text, expected):
                ok += 1

    print(f"\nResult: {ok}/{total} passed")
    sys.exit(0 if ok == total else 1)


if __name__ == "__main__":
    main()
