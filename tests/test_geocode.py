"""
Testes unitários do módulo geocode (funções puras + Geocoder mockado).
"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.geocode import (
    _limpar_endereco,
    _so_logradouro,
    Geocoder,
    GeocodeResult,
    CepResult,
)


def test_limpeza():
    print("Limpeza de endereço:")
    casos = [
        ("Rua X, 10 - Centro (11) 4411-0062", "Rua X, 10 - Centro"),
        ("Av. Y, 500, s/n", "Av. Y, 500"),
        ("Rua Z, Qd. 07, s/nº", "Rua Z, Qd. 07"),
        ("Rua W - 3856-9600", "Rua W"),
    ]
    ok = 0
    for entrada, esperado in casos:
        obtido = _limpar_endereco(entrada)
        status = "✓" if obtido == esperado else "✗"
        print(f"  {status} {entrada!r} → {obtido!r}")
        if obtido == esperado:
            ok += 1
    return ok, len(casos)


def test_logradouro():
    print("\nExtração de logradouro:")
    casos = [
        ("Rua Joaquim Luiz Viana, 209 - Vila Cicma", "Rua Joaquim Luiz Viana"),
        ("Avenida Vital Brasil, 1500 - Instituto Butantan", "Avenida Vital Brasil"),
        ("Praça D. Pedro II, 1826 - Centro", "Praça D. Pedro II"),
    ]
    ok = 0
    for entrada, esperado in casos:
        obtido = _so_logradouro(entrada)
        status = "✓" if obtido == esperado else "✗"
        print(f"  {status} {entrada!r} → {obtido!r}")
        if obtido == esperado:
            ok += 1
    return ok, len(casos)


def test_geocoder_cache():
    print("\nCache do Geocoder:")
    g = Geocoder()
    mock_result = GeocodeResult(lat=-23.5, lng=-46.6, fonte="nominatim")

    chamadas = []
    def fake_query(q):
        chamadas.append(q)
        return mock_result

    g._query_nominatim = fake_query
    # Duas chamadas com os mesmos parâmetros — só uma deve bater no Nominatim.
    r1 = g.geocode_endereco("Rua X, 10", "São Paulo", "SP")
    r2 = g.geocode_endereco("Rua X, 10", "São Paulo", "SP")

    ok = 0
    total = 3
    if r1 == mock_result:
        ok += 1; print("  ✓ resultado retornado")
    else:
        print("  ✗ resultado incorreto")
    if r2 == mock_result:
        ok += 1; print("  ✓ segundo resultado idêntico (do cache)")
    else:
        print("  ✗ segundo resultado divergente")
    if len(chamadas) == 1:
        ok += 1; print(f"  ✓ Nominatim chamado apenas 1 vez (cache funcionou)")
    else:
        print(f"  ✗ Nominatim chamado {len(chamadas)} vezes (deveria ser 1)")
    return ok, total


def test_cep_invalido():
    print("\nCEP inválido:")
    g = Geocoder()
    casos = ["", "abc", "1234", "123-456", None]
    ok = 0
    for c in casos:
        r = g.consultar_cep(c)
        status = "✓" if r is None else "✗"
        print(f"  {status} consultar_cep({c!r}) → {r}")
        if r is None:
            ok += 1
    return ok, len(casos)


if __name__ == "__main__":
    total_ok = 0
    total = 0
    for fn in [test_limpeza, test_logradouro, test_geocoder_cache, test_cep_invalido]:
        ok, t = fn()
        total_ok += ok
        total += t
    print(f"\nResultado: {total_ok}/{total}")
    sys.exit(0 if total_ok == total else 1)
