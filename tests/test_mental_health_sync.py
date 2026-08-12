"""
Unit tests for the mental_health (CAPS) collection pipeline.

Fakes for both providers — what's under test is the assembly logic: subtype
vocabulary, the site-detail join, and the miss-ratio guardrail that stops a
half-resolved dataset from looking like mass CAPS closures.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.providers.cnes_api import CnesListedEstablishment
from scripts.providers.cnes_site import CnesSiteDetails
from scripts.syncs.mental_health.runner import collect
from scripts.syncs.mental_health.subtipos import resolve_caps_subtype


def _listed(
    cnes: str, unit_code: str | None = None, **overrides: object
) -> CnesListedEstablishment:
    fields: dict[str, object] = {
        "cnes": cnes,
        "name": f"CAPS {cnes}",
        "unit_code": unit_code if unit_code is not None else f"35001{cnes}",
        "uf_code": 35,
        "municipality_code": 355030,
        "address": "RUA A, 10",
        "cep": "01000000",
        "phone": "11 30000000",
        "lat": -23.55,
        "lng": -46.63,
        "updated_at": "2026-08-01",
    }
    fields.update(overrides)
    return CnesListedEstablishment(**fields)  # type: ignore[arg-type]  # test fixture


def _details(cnes: str, subtype: str | None = "CAPS I", uf: str = "SP") -> CnesSiteDetails:
    return CnesSiteDetails(
        cnes=cnes,
        name=f"CAPS {cnes}",
        uf=uf,
        city="São Paulo",
        unit_type="CENTRO DE ATENCAO PSICOSSOCIAL",
        subtype=subtype,
    )


class _FakeApi:
    def __init__(self, rows: list[CnesListedEstablishment]):
        self._rows = rows

    def list_by_unit_type(
        self, unit_type_code: int, uf_code: int | None = None
    ) -> list[CnesListedEstablishment]:
        assert unit_type_code == 70
        return self._rows


class _FakeSite:
    def __init__(self, by_unit_code: dict[str, CnesSiteDetails | None]):
        self._by_unit_code = by_unit_code

    def fetch_details(self, unit_code: str) -> CnesSiteDetails | None:
        return self._by_unit_code.get(unit_code)


def test_subtype_vocabulary() -> None:
    cases = {
        "CAPS I": "caps_i",
        "caps iii": "caps_iii",
        "CAPS INFANTO/JUVENIL": "caps_ij",
        "CAPS ÁLCOOL E DROGA": "caps_ad",
        "CAPS ALCOOL E DROGAS III - MUNICIPAL": "caps_ad_iii",
        "CAPS ALCOOL E DROGAS III - REGIONAL": "caps_ad_iii",
        "CAPS AD IV": "caps_ad_iv",
    }
    for raw, expected in cases.items():
        assert resolve_caps_subtype(raw) == expected, raw

    assert resolve_caps_subtype(None) is None
    assert resolve_caps_subtype("HOSPITAL DIA") is None


def test_collect_joins_listing_with_site_details() -> None:
    api = _FakeApi([_listed("111"), _listed("222")])
    site = _FakeSite(
        {
            "35001111": _details("111", subtype="CAPS AD IV"),
            "35001222": _details("222", subtype=None),
        }
    )

    hospitals = collect(api, site)  # type: ignore[arg-type]  # duck-typed doubles

    assert set(hospitals) == {"111", "222"}
    first = hospitals["111"]
    assert first["state_code"] == "SP"
    assert first["city"] == "São Paulo"
    assert first["lat"] == -23.55
    assert [e["specialty"] for e in first["specialties"]] == ["caps_ad_iv"]
    # sem subtipo → permanece na vertical, sem especialidade
    assert hospitals["222"]["specialties"] == []


def test_collect_aborts_when_too_many_details_missing() -> None:
    api = _FakeApi([_listed(str(i)) for i in range(10)])
    site = _FakeSite({"350010": _details("0")})  # 9 de 10 sem detalhe

    try:
        collect(api, site)  # type: ignore[arg-type]  # duck-typed doubles
    except RuntimeError as e:
        assert "meio-resolvido" in str(e)
        return
    raise AssertionError("esperava RuntimeError do guardrail de misses")


def test_collect_drops_rows_without_unit_code_or_unknown_uf() -> None:
    api = _FakeApi(
        [
            _listed("111"),
            _listed("333", unit_code=""),  # sem CO_UNIDADE — nunca consulta o site
            _listed("444"),
        ]
    )
    site = _FakeSite(
        {
            "35001111": _details("111"),
            "35001444": _details("444", uf="XX"),  # UF fora do conjunto conhecido
        }
    )

    hospitals = collect(api, site)  # type: ignore[arg-type]  # duck-typed doubles

    assert set(hospitals) == {"111"}


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
