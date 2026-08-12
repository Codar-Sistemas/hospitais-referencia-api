"""
Unit tests for the CNES confirmation policy and the enrichment runner.

The policy decides `cnes_confirmed` — the flag that lowers
`requires_verification` in the DB (sql/027) — so the rules under test are
the conservative ones: confirmation needs a positive match, never just the
absence of contradiction, and the runner never overwrites a non-empty
extracted value.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.enrichment.policy import evaluate
from scripts.enrichment.runner import enrich
from scripts.providers.cnes_api import CnesEstablishment


def _registry(**overrides: Any) -> CnesEstablishment:
    base: dict[str, Any] = {
        "cnes": "2077647",
        "address": "RUA OFICIAL, 1, CENTRO",
        "cep": "01000000",
        "phone": "(18) 3502-2200",
        "lat": -21.6930,
        "lng": -51.0708,
    }
    base.update(overrides)
    return CnesEstablishment(**base)


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------
def test_phone_and_coords_matching_confirms() -> None:
    outcome = evaluate(
        phones="(18) 35022200 / (18) 99999-0000",
        lat=-21.6931,
        lng=-51.0709,
        registry=_registry(),
    )

    assert outcome.confirmed
    assert outcome.matches == ["phone", "coords"]
    assert outcome.divergences == []


def test_no_comparable_signal_is_not_confirmation() -> None:
    # Registry found, but nothing to compare (no phone/coords on the row):
    # absence of contradiction must not confirm.
    outcome = evaluate(phones=None, lat=None, lng=None, registry=_registry())

    assert not outcome.confirmed
    assert outcome.matches == []
    assert outcome.divergences == []


def test_far_coordinates_diverge_even_with_matching_phone() -> None:
    outcome = evaluate(
        phones="18 3502 2200",
        lat=-23.55,  # São Paulo, ~250 km away from the registry entry
        lng=-46.63,
        registry=_registry(),
    )

    assert not outcome.confirmed
    assert outcome.matches == ["phone"]
    assert outcome.divergences == ["coords"]


def test_different_phone_diverges() -> None:
    outcome = evaluate(
        phones="(11) 4444-5555",
        lat=None,
        lng=None,
        registry=_registry(),
    )

    assert not outcome.confirmed
    assert outcome.divergences == ["phone"]


def test_short_phone_fragment_is_ignored() -> None:
    # An OCR fragment ("2200") is neither a match nor a contradiction.
    outcome = evaluate(phones="2200", lat=None, lng=None, registry=_registry())

    assert outcome.matches == []
    assert outcome.divergences == []


# ---------------------------------------------------------------------------
# Runner (fake client + fake provider)
# ---------------------------------------------------------------------------
class _FakeClient:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self.updates: list[tuple[dict[str, Any], dict[str, Any]]] = []

    def select(self, table: str, **params: str) -> list[dict[str, Any]]:
        return self._rows

    def update(self, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
        self.updates.append((match, values))


class _FakeProvider:
    def __init__(self, by_cnes: dict[str, CnesEstablishment | None]):
        self._by_cnes = by_cnes

    def fetch(self, cnes: str) -> CnesEstablishment | None:
        return self._by_cnes.get(cnes)


def test_runner_fills_only_empty_fields_and_records_outcome() -> None:
    rows = [
        {
            "id": 1,
            "cnes": "2077647",
            "name": "HOSPITAL A",
            "phones": "(18) 35022200",  # non-empty: must NOT be overwritten
            "address": None,  # empty: must be filled
            "lat": None,
            "lng": None,
            "geocoding_status": "pending",
        }
    ]
    client = _FakeClient(rows)
    provider = _FakeProvider({"2077647": _registry()})

    counts = enrich(client, provider, limit=10)  # type: ignore[arg-type]  # duck-typed doubles

    assert counts == {"checked": 1, "confirmed": 1, "diverged": 0, "misses": 0, "filled": 1}
    ((match, values),) = client.updates
    assert match == {"id": 1}
    assert values["cnes_confirmed"] is True
    assert values["cnes_divergences"] == []
    assert values["address"] == "RUA OFICIAL, 1, CENTRO"
    assert "phones" not in values  # extracted value preserved
    assert values["lat"] == -21.6930
    assert values["geocoding_source"] == "cnes_api"


def test_runner_registry_miss_only_stamps_checked_at() -> None:
    rows = [
        {
            "id": 2,
            "cnes": "9999999",
            "name": "HOSPITAL B",
            "phones": None,
            "address": None,
            "lat": None,
            "lng": None,
            "geocoding_status": "pending",
        }
    ]
    client = _FakeClient(rows)
    provider = _FakeProvider({})

    counts = enrich(client, provider, limit=10)  # type: ignore[arg-type]  # duck-typed doubles

    assert counts["misses"] == 1
    ((_, values),) = client.updates
    assert set(values) == {"cnes_checked_at"}


def test_runner_skips_garbled_cnes_and_dry_run_writes_nothing() -> None:
    rows = [
        {
            "id": 3,
            "cnes": "s/n",
            "name": "SEM CNES",
            "phones": None,
            "address": None,
            "lat": None,
            "lng": None,
            "geocoding_status": "pending",
        },
        {
            "id": 4,
            "cnes": "2077647",
            "name": "HOSPITAL A",
            "phones": None,
            "address": None,
            "lat": None,
            "lng": None,
            "geocoding_status": "pending",
        },
    ]
    client = _FakeClient(rows)
    provider = _FakeProvider({"2077647": _registry()})

    counts = enrich(client, provider, limit=10, dry_run=True)  # type: ignore[arg-type]  # duck-typed doubles

    assert counts["checked"] == 1  # the garbled row never reached the API
    assert client.updates == []


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
