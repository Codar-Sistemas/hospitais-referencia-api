"""
Unit tests for CnesApiProvider.list_by_unit_type (mocked session).

The listing feeds whole verticals (CAPS, blood centers), so the behaviors
under test are the ones that protect the dataset: pagination in fixed steps
of 20 (the API caps `limit` silently), and hard failure — not silent
truncation — when a page cannot be fetched.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.providers.cnes_api import (
    LIST_PAGE_SIZE,
    CnesApiProvider,
    CnesListedEstablishment,
)


def _row(cnes: int, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "codigo_cnes": cnes,
        "nome_fantasia": f"CAPS {cnes}",
        "nome_razao_social": "MUNICIPIO DE TESTE",
        "codigo_uf": 35,
        "codigo_municipio": 355030,
        "endereco_estabelecimento": "RUA A",
        "numero_estabelecimento": "10",
        "bairro_estabelecimento": "CENTRO",
        "codigo_cep_estabelecimento": "01000000",
        "numero_telefone_estabelecimento": "11 30000000",
        "latitude_estabelecimento_decimo_grau": -23.55,
        "longitude_estabelecimento_decimo_grau": -46.63,
        "data_atualizacao": "2026-08-01",
    }
    base.update(overrides)
    return base


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any] | None = None):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._payload = payload if payload is not None else {}

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeSession:
    """Replays a fixed queue of responses and records the params sent."""

    def __init__(self, responses: list[_FakeResponse]):
        self._responses = responses
        self.calls: list[dict[str, int] | None] = []
        self.headers: dict[str, str] = {}

    def get(
        self,
        url: str,
        params: dict[str, int] | None = None,
        timeout: int | None = None,
    ) -> _FakeResponse:
        self.calls.append(params)
        return self._responses[len(self.calls) - 1]


def _expect_runtime_error(fn: Any, fragment: str) -> None:
    try:
        fn()
    except RuntimeError as e:
        assert fragment in str(e), f"expected {fragment!r} in {e}"
        return
    raise AssertionError(f"expected RuntimeError containing {fragment!r}")


def _provider(responses: list[_FakeResponse]) -> tuple[CnesApiProvider, _FakeSession]:
    session = _FakeSession(responses)
    # delay 0: throttling is real behavior, but pointless in unit tests
    provider = CnesApiProvider(
        session=session,  # type: ignore[arg-type]  # duck-typed test double
        delay_s=0,
        max_retries=2,
    )
    return provider, session


def test_paginates_until_short_page() -> None:
    full_page = {"estabelecimentos": [_row(i) for i in range(LIST_PAGE_SIZE)]}
    short_page = {"estabelecimentos": [_row(100), _row(101)]}
    provider, session = _provider([_FakeResponse(200, full_page), _FakeResponse(200, short_page)])

    rows = provider.list_by_unit_type(70)

    assert len(rows) == LIST_PAGE_SIZE + 2
    assert [c["offset"] for c in session.calls if c] == [0, LIST_PAGE_SIZE]
    assert all(c["codigo_tipo_unidade"] == 70 for c in session.calls if c)


def test_empty_first_page_returns_empty_list() -> None:
    provider, _ = _provider([_FakeResponse(200, {"estabelecimentos": []})])

    assert provider.list_by_unit_type(69) == []


def test_uf_filter_is_forwarded() -> None:
    provider, session = _provider([_FakeResponse(200, {"estabelecimentos": []})])

    provider.list_by_unit_type(70, uf_code=35)

    first_call = session.calls[0]
    assert first_call is not None
    assert first_call["codigo_uf"] == 35


def test_persistent_failure_raises_instead_of_truncating() -> None:
    provider, _ = _provider([_FakeResponse(500), _FakeResponse(500)])

    _expect_runtime_error(lambda: provider.list_by_unit_type(70), "offset 0")


def test_unexpected_shape_raises() -> None:
    provider, _ = _provider([_FakeResponse(200, {"estabelecimentos": "oops"})])

    _expect_runtime_error(lambda: provider.list_by_unit_type(70), "unexpected shape")


def test_row_parsing_and_fallbacks() -> None:
    rows_payload = {
        "estabelecimentos": [
            _row(123),
            # nome_fantasia missing → razão social fallback; coords outside
            # Brazil → nulled (registry carries null-island rows)
            _row(
                456,
                nome_fantasia=None,
                latitude_estabelecimento_decimo_grau=0,
                longitude_estabelecimento_decimo_grau=0,
            ),
        ]
    }
    provider, _ = _provider([_FakeResponse(200, rows_payload)])

    rows = provider.list_by_unit_type(70)

    first, second = rows
    assert isinstance(first, CnesListedEstablishment)
    assert first.cnes == "123"
    assert first.name == "CAPS 123"
    assert first.uf_code == 35
    assert first.address == "RUA A, 10, CENTRO"
    assert first.lat == -23.55
    assert first.updated_at == "2026-08-01"

    assert second.name == "MUNICIPIO DE TESTE"
    assert second.lat is None
    assert second.lng is None


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
