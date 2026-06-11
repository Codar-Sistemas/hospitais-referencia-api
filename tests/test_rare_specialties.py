"""
Unit tests for the rare-diseases qualification-type -> specialty mapping.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.syncs.rare_diseases.specialties import (
    SPECIALTY_GENE_THERAPY,
    SPECIALTY_RARE_DISEASES_REFERENCE,
    SPECIALTY_RARE_DISEASES_SPECIALIZED_CARE,
    UnknownQualificationTypeError,
    map_qualification_type,
)


def check(desc, input_text, expected):
    result = map_qualification_type(input_text)
    if result == expected:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}")
    print(f"       input:    {input_text!r}")
    print(f"       expected: {expected}")
    print(f"       got:      {result}")
    return False


def main():
    results = [
        check(
            "reference service (SRDR)",
            "Serviço de Referência em Doenças Raras",
            [SPECIALTY_RARE_DISEASES_REFERENCE],
        ),
        check(
            "specialized care (SAE)",
            "Serviço de Atenção Especializada em Doenças Raras",
            [SPECIALTY_RARE_DISEASES_SPECIALIZED_CARE],
        ),
        check(
            "combined label yields both",
            "Serviço de Atenção Especializada em Doenças Raras e "
            "Serviço de Referência em Doenças Raras",
            [SPECIALTY_RARE_DISEASES_REFERENCE, SPECIALTY_RARE_DISEASES_SPECIALIZED_CARE],
        ),
        check(
            "gene therapy",
            "Serviço de Terapia Gênica",
            [SPECIALTY_GENE_THERAPY],
        ),
        check(
            "accent/case insensitive",
            "SERVICO DE TERAPIA GENICA",
            [SPECIALTY_GENE_THERAPY],
        ),
    ]

    try:
        map_qualification_type("Serviço de Oncologia Pediátrica")
        print("  ✗ unknown type raises")
        results.append(False)
    except UnknownQualificationTypeError:
        print("  ✓ unknown type raises")
        results.append(True)

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
