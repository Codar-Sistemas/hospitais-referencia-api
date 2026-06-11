"""
Unit tests for the multi-vertical upsert rules.

Covers the rare_diseases upserter (insert / join shared rows / leave) AND
the venomous upserter safety patch (vertical-filtered select + strip
instead of delete) — the two sides of the "never clobber another
vertical's data" contract.

FakeSupabaseClient implements just enough PostgREST filter semantics
(eq. / cs.{} / in.()) over an in-memory store to exercise both modules.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.syncs.rare_diseases.upserter import upsert_rare_disease_hospitals
from scripts.syncs.venomous_animals.upserter import upsert_hospitals
from tests.fake_supabase import FakeSupabaseClient


def check(desc, condition, detail=""):
    if condition:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}{f' — {detail}' if detail else ''}")
    return False


def rare_hospital(cnes, name="Hospital", city="Cidade", uf="SP", specialty="gene_therapy"):
    return {
        "state_code": uf,
        "city": city,
        "name": name,
        "cnes": cnes,
        "address": "Rua A, 1",
        "phones": "(11) 1111-1111",
        "lat": -23.5,
        "lng": -46.6,
        "specialties": [
            {
                "specialty": specialty,
                "habilitado_em": "2024-01-01",
                "source_url": "https://example.org/x.xlsx",
                "metadata": {},
            }
        ],
    }


def main():
    results = []

    # ==================================================================
    # rare_diseases upserter
    # ==================================================================
    venomous_row = {
        "id": 1,
        "cnes": "0000001",
        "city": "Botucatu",
        "name": "HC Botucatu (PDF formatting)",
        "address": "Endereço do PDF",
        "verticals": ["venomous_animals"],
        "lat": -22.9,
        "lng": -48.4,
        "geocoding_status": "ok",
    }
    rare_only_row = {
        "id": 2,
        "cnes": "0000002",
        "city": "Salvador",
        "name": "APAE Salvador",
        "address": "Rua B",
        "verticals": ["rare_diseases"],
        "lat": -13.0,
        "lng": -38.5,
        "geocoding_status": "ok",
    }
    client = FakeSupabaseClient(
        hospitals=[venomous_row, rare_only_row],
        specialties=[
            {
                "hospital_id": 2,
                "vertical": "rare_diseases",
                "specialty": "rare_diseases_reference",
            }
        ],
    )

    snapshot = {
        # joins the venomous row (same CNES)
        "0000001": rare_hospital("0000001", name="HC Botucatu (XLSX formatting)"),
        # brand new establishment
        "0000003": rare_hospital("0000003", name="Hospital Novo", uf="CE"),
        # NOTE: 0000002 left the snapshot on purpose
    }
    inserted, updated, removed = upsert_rare_disease_hospitals(client, snapshot)  # type: ignore[arg-type]

    results.append(
        check(
            "counts (1 inserted, 1 joined, 1 removed)",
            (inserted, updated, removed) == (1, 1, 1),
            f"got {(inserted, updated, removed)}",
        )
    )

    joined = next(r for r in client.tables["hospitals"] if r.get("id") == 1)
    results.append(
        check(
            "shared row gains rare_diseases tag",
            sorted(joined["verticals"]) == ["rare_diseases", "venomous_animals"],
            str(joined["verticals"]),
        )
    )
    results.append(
        check(
            "shared row core fields untouched (venomous owns them)",
            joined["name"] == "HC Botucatu (PDF formatting)"
            and joined["address"] == "Endereço do PDF",
            joined["name"],
        )
    )

    results.append(
        check(
            "rare-only row that left the snapshot is deleted",
            all(r.get("id") != 2 for r in client.tables["hospitals"]),
        )
    )
    results.append(
        check(
            "stale specialty rows deleted with it",
            all(s["hospital_id"] != 2 for s in client.tables["hospital_specialties"]),
        )
    )

    new_row = next(r for r in client.tables["hospitals"] if r.get("cnes") == "0000003")
    results.append(
        check(
            "new row tagged rare_diseases with empty treatments",
            new_row["verticals"] == ["rare_diseases"] and new_row["treatments"] == [],
        )
    )
    results.append(
        check(
            "CNES-API coordinates written directly (no Nominatim queue)",
            new_row["geocoding_status"] == "ok" and new_row["geocoding_source"] == "cnes_api",
        )
    )
    results.append(
        check(
            "specialties written for both snapshot rows",
            len(client.tables["hospital_specialties"]) == 2,
            str(client.tables["hospital_specialties"]),
        )
    )

    # ------------------------------------------------------------------
    # leave: shared row loses only the tag + its specialties
    # ------------------------------------------------------------------
    inserted, updated, removed = upsert_rare_disease_hospitals(
        client,  # type: ignore[arg-type]
        {"0000003": rare_hospital("0000003", name="Hospital Novo", uf="CE")},
    )
    survivor = next(r for r in client.tables["hospitals"] if r.get("id") == 1)
    results.append(
        check(
            "shared row survives leave with venomous tag only",
            survivor["verticals"] == ["venomous_animals"],
            str(survivor["verticals"]),
        )
    )
    results.append(
        check(
            "its rare specialties are gone",
            all(
                not (s["hospital_id"] == 1 and s["vertical"] == "rare_diseases")
                for s in client.tables["hospital_specialties"]
            ),
        )
    )

    # ==================================================================
    # venomous upserter safety patch (regression for the latent bug)
    # ==================================================================
    client = FakeSupabaseClient(
        hospitals=[
            {
                "id": 10,
                "state_code": "SP",
                "cnes": "0000010",
                "city": "Campinas",
                "name": "Hospital Raras-Only",
                "address": "Rua C",
                "verticals": ["rare_diseases"],
            },
            {
                "id": 11,
                "state_code": "SP",
                "cnes": "0000011",
                "city": "Santos",
                "name": "Hospital Compartilhado",
                "address": "Rua D",
                "verticals": ["venomous_animals", "rare_diseases"],
            },
        ],
        specialties=[
            {"hospital_id": 11, "vertical": "venomous_animals", "specialty": "bothropic"},
            {"hospital_id": 11, "vertical": "rare_diseases", "specialty": "gene_therapy"},
        ],
    )

    # Venomous sync for SP with an empty PDF snapshot: nothing matched.
    upsert_hospitals(
        client,  # type: ignore[arg-type]
        "SP",
        [],
        extraction_source="pdf_text",
        ocr_confidence=None,
    )

    results.append(
        check(
            "rare-only hospital invisible to venomous diff (NOT deleted)",
            any(r.get("id") == 10 for r in client.tables["hospitals"]),
        )
    )
    shared = next((r for r in client.tables["hospitals"] if r.get("id") == 11), None)
    results.append(check("shared hospital row survives", shared is not None))
    results.append(
        check(
            "shared hospital stripped to rare_diseases only",
            shared is not None and shared["verticals"] == ["rare_diseases"],
            str(shared and shared["verticals"]),
        )
    )
    results.append(
        check(
            "venomous specialties removed, rare ones kept",
            [s["vertical"] for s in client.tables["hospital_specialties"] if s["hospital_id"] == 11]
            == ["rare_diseases"],
            str(client.tables["hospital_specialties"]),
        )
    )

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
