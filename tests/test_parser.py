"""
Smoke test do parser contra o PDF de SP que temos em mão.

Rodar: cd hospitais-referencia-api && python -m tests.test_parser
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.parser import parse_pdf, TIPOS_ATENDIMENTO


def test_sp(pdf_path: str):
    print(f"Parseando {pdf_path} ...")
    recs = parse_pdf(pdf_path, uf="SP")

    assert len(recs) > 200, f"Esperava 200+ registros, obtive {len(recs)}"
    print(f"✓ {len(recs)} registros")

    # Checa campos obrigatórios
    for r in recs:
        assert r["municipio"], f"Registro sem município: {r}"
        assert r["unidade"], f"Registro sem unidade: {r}"
        assert r["uf"] == "SP"
        assert isinstance(r["atendimentos"], list)
    print("✓ Todos registros têm município, unidade e uf")

    # Checa que os atendimentos são do conjunto canônico
    todos_atendimentos = set()
    for r in recs:
        for a in r["atendimentos"]:
            todos_atendimentos.add(a)
    for a in todos_atendimentos:
        assert a in TIPOS_ATENDIMENTO, f"Atendimento fora do canônico: {a}"
    print(f"✓ Atendimentos distintos encontrados: {sorted(todos_atendimentos)}")

    # Casos específicos conhecidos do PDF de SP
    adamantina = next(r for r in recs if r["municipio"] == "Adamantina")
    assert "Santa Casa" in adamantina["unidade"]
    assert "Botrópico" in adamantina["atendimentos"]
    print(f"✓ Adamantina OK: {adamantina['unidade']}")

    botucatu = next(r for r in recs if r["municipio"] == "Botucatu")
    # Botucatu é um dos poucos com TODOS os atendimentos (inclusive Laquético)
    assert "Laquético" in botucatu["atendimentos"], \
        f"Botucatu deveria ter Laquético: {botucatu['atendimentos']}"
    print(f"✓ Botucatu OK: {len(botucatu['atendimentos'])} atendimentos")

    # Municípios que aparecem mais de uma vez (várias unidades)
    from collections import Counter
    c = Counter(r["municipio"] for r in recs)
    multi = {m: n for m, n in c.items() if n > 1}
    print(f"✓ Municípios com múltiplas unidades: {len(multi)} "
          f"(ex: Bauru={c['Bauru']}, Campinas={c['Campinas']}, "
          f"São Paulo={c['São Paulo']})")

    print(f"\n✅ Todos os testes passaram. Total: {len(recs)} hospitais em SP.")


if __name__ == "__main__":
    pdf = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/sp.pdf"
    test_sp(pdf)
