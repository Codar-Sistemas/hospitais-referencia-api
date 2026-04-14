"""
Testes unitários de normalize_atendimentos, cobrindo casos reais
observados em PDFs de diversos estados.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.parser import normalize_atendimentos


def check(desc, entrada, esperado):
    obtido = normalize_atendimentos(entrada)
    obtido_set = set(obtido)
    esperado_set = set(esperado)
    if obtido_set == esperado_set:
        print(f"  ✓ {desc}")
        return True
    else:
        print(f"  ✗ {desc}")
        print(f"       entrada:  {entrada!r}")
        print(f"       esperado: {sorted(esperado_set)}")
        print(f"       obtido:   {sorted(obtido_set)}")
        return False


def main():
    print("Casos observados em SP:")
    casos_sp = [
        ("lista completa com acento",
         "Botrópico, Crotálico, Loxoscélico, Fonêutrico e Escorpiônico.",
         ["Botrópico", "Crotálico", "Loxoscélico", "Foneutrico", "Escorpiônico"]),
        ("Botucatu (todos 8)",
         "Botrópico, Crotálico, Elapídico, Laquético, Escorpiônico, Loxoscélico, Fonêutrico e Lonômico",
         ["Botrópico", "Crotálico", "Elapídico", "Laquético",
          "Escorpiônico", "Loxoscélico", "Foneutrico", "Lonômico"]),
        ("apenas Escorpiônico",
         "Escorpiônico",
         ["Escorpiônico"]),
        ("ITAPOLIS caixa alta",
         "BOTRÓPICO, CROTÁLICO, Loxoscélico, Fonêutrico E ESCORPIÔNICO",
         ["Botrópico", "Crotálico", "Loxoscélico", "Foneutrico", "Escorpiônico"]),
    ]

    print("\nCasos observados em MG:")
    casos_mg = [
        ("sem acento em Foneutrico",
         "Botrópico, Escorpiônico, Loxoscélico e Fonêutrico",
         ["Botrópico", "Escorpiônico", "Loxoscélico", "Foneutrico"]),
        ("Uberaba: Botrópico-Crotálico composto",
         "Botrópico, Crotálico, Botrópico-Crotálico, Elapídico, Escorpiônico, Loxoscélico, Fonêutrico e Lonômico",
         ["Botrópico", "Crotálico", "Elapídico",
          "Escorpiônico", "Loxoscélico", "Foneutrico", "Lonômico"]),
        ("Uberlândia: lista com Laquético",
         "Botrópico, Crotálico, Elapídico, Laquético, Escorpiônico, Loxoscélico, Fonêutrico e Lonômico",
         ["Botrópico", "Crotálico", "Elapídico", "Laquético",
          "Escorpiônico", "Loxoscélico", "Foneutrico", "Lonômico"]),
        ("Teófilo Otoni: só Botrópico",
         "Botrópico",
         ["Botrópico"]),
    ]

    print("\nCasos de borda:")
    casos_borda = [
        ("vazio", "", []),
        ("None", None, []),
        ("texto sem tipos válidos", "Hospital aberto 24h", []),
        ("só pontuação", ",,,", []),
    ]

    total = 0
    ok = 0
    for grupo in (casos_sp, casos_mg, casos_borda):
        for desc, entrada, esperado in grupo:
            total += 1
            if check(desc, entrada, esperado):
                ok += 1

    print(f"\nResultado: {ok}/{total} passaram")
    sys.exit(0 if ok == total else 1)


if __name__ == "__main__":
    main()
