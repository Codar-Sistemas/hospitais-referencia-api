"""
Unit tests for the geocoding module (pure helpers + mocked Geocoder).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.geocoding.address_normalizer import clean_address, street_only
from scripts.geocoding.runner import Geocoder
from scripts.providers.base import GeocodingResult


def test_clean_address():
    print("Address cleaning:")
    cases = [
        ("Rua X, 10 - Centro (11) 4411-0062", "Rua X, 10 - Centro"),
        ("Av. Y, 500, s/n", "Av. Y, 500"),
        ("Rua Z, Qd. 07, s/nº", "Rua Z, Qd. 07"),
        ("Rua W - 3856-9600", "Rua W"),
    ]
    ok = 0
    for input_text, expected in cases:
        result = clean_address(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} {input_text!r} → {result!r}")
        if result == expected:
            ok += 1
    return ok, len(cases)


def test_street_only():
    print("\nStreet extraction:")
    cases = [
        ("Rua Joaquim Luiz Viana, 209 - Vila Cicma", "Rua Joaquim Luiz Viana"),
        ("Avenida Vital Brasil, 1500 - Instituto Butantan", "Avenida Vital Brasil"),
        ("Praça D. Pedro II, 1826 - Centro", "Praça D. Pedro II"),
    ]
    ok = 0
    for input_text, expected in cases:
        result = street_only(input_text)
        status = "✓" if result == expected else "✗"
        print(f"  {status} {input_text!r} → {result!r}")
        if result == expected:
            ok += 1
    return ok, len(cases)


def test_geocoder_cache():
    print("\nGeocoder cache:")
    geocoder = Geocoder()
    mock_result = GeocodingResult(lat=-23.5, lng=-46.6, source="nominatim")

    calls = []

    def fake_query(query):
        calls.append(query)
        return mock_result

    # Replace the internal provider query helper used by geocode_address.
    geocoder._query_provider = fake_query  # type: ignore[method-assign]

    r1 = geocoder.geocode_address("Rua X, 10", "São Paulo", "SP")
    r2 = geocoder.geocode_address("Rua X, 10", "São Paulo", "SP")

    ok = 0
    total = 3
    if r1 == mock_result:
        ok += 1
        print("  ✓ result returned")
    else:
        print("  ✗ wrong result")
    if r2 == mock_result:
        ok += 1
        print("  ✓ second call identical (from cache)")
    else:
        print("  ✗ second call diverged")
    if len(calls) == 1:
        ok += 1
        print("  ✓ provider called only once (cache worked)")
    else:
        print(f"  ✗ provider called {len(calls)} times (expected 1)")
    return ok, total


def test_invalid_cep():
    print("\nInvalid CEP:")
    geocoder = Geocoder()
    cases: list[str | None] = ["", "abc", "1234", "123-456", None]
    ok = 0
    for cep in cases:
        # `lookup_cep` is typed as `str` but the implementation guards
        # `None`/empty inputs — we exercise that on purpose here.
        result = geocoder.lookup_cep(cep)  # type: ignore[arg-type]
        status = "✓" if result is None else "✗"
        print(f"  {status} lookup_cep({cep!r}) → {result}")
        if result is None:
            ok += 1
    return ok, len(cases)


if __name__ == "__main__":
    total_ok = 0
    total = 0
    for fn in [test_clean_address, test_street_only, test_geocoder_cache, test_invalid_cep]:
        ok, t = fn()
        total_ok += ok
        total += t
    print(f"\nResult: {total_ok}/{total}")
    sys.exit(0 if total_ok == total else 1)
