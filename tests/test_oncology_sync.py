"""
Unit tests for the oncology snapshot assembly + shared upsert engine
(merge across files, portaria persistence, vertical scoping).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.shared.qualification_sync import upsert_qualification_hospitals
from scripts.syncs.oncology.runner import build_hospital_records
from tests.fake_supabase import FakeSupabaseClient


def check(desc, condition, detail=""):
    if condition:
        print(f"  ✓ {desc}")
        return True
    print(f"  ✗ {desc}{f' — {detail}' if detail else ''}")
    return False


def onco_row(cnes, codes, source_key, portaria=None, name="Hospital X"):
    return {
        "state_code": "BA",
        "city": "Salvador",
        "region": "Leste",
        "cnes": cnes,
        "name": name,
        "qualification_text_raw": "descrição",
        "qualification_codes": codes,
        "portaria": portaria,
        "source_key": source_key,
        "source_url": f"https://example.org/{source_key}.xlsx",
    }


def main():
    results = []

    # ------------------------------------------------------------------
    # build_hospital_records: same CNES across the 3 files merges into one
    # hospital with one specialty entry per macro category.
    # ------------------------------------------------------------------
    rows = [
        onco_row("0003786", ["17.13"], "oncology_qualifications"),
        onco_row("0003786", ["17.23"], "breast_reconstruction"),
        onco_row("0003786", ["17.22"], "synchronous_treatment"),
        # Same hospital appearing twice in the main file with UNACON codes
        # that collapse into a single 'unacon' entry with merged codes.
        onco_row("2005417", ["17.06"], "oncology_qualifications", name="Hospital Y"),
        onco_row("2005417", ["17.07", "17.08"], "oncology_qualifications", name="Hospital Y"),
        # Radiotherapy with portaria.
        onco_row(
            "0001023", ["17.04"], "oncology_qualifications", portaria="SAS 618, DE 26/09/2199"
        ),
    ]
    hospitals = build_hospital_records(rows)

    results.append(check("3 unique CNES", len(hospitals) == 3, f"got {len(hospitals)}"))
    aristides = hospitals["0003786"]
    results.append(
        check(
            "3 macro specialties for the multi-file hospital",
            sorted(e["specialty"] for e in aristides["specialties"])
            == ["breast_reconstruction", "cacon", "synchronous_treatment"],
            str([e["specialty"] for e in aristides["specialties"]]),
        )
    )
    unacon = hospitals["2005417"]["specialties"]
    results.append(check("UNACON entries collapse to one", len(unacon) == 1, str(unacon)))
    results.append(
        check(
            "merged codes union ordered",
            unacon[0]["metadata"]["qualification_codes"] == ["17.06", "17.07", "17.08"],
            str(unacon[0]["metadata"]["qualification_codes"]),
        )
    )
    radio = hospitals["0001023"]["specialties"][0]
    results.append(
        check("portaria carried into the entry", radio.get("portaria") == "SAS 618, DE 26/09/2199")
    )

    # ------------------------------------------------------------------
    # Shared upsert engine with vertical='oncology': portaria written to
    # hospital_specialties; rows of other verticals untouched.
    # ------------------------------------------------------------------
    rare_row = {
        "id": 1,
        "state_code": "BA",
        "cnes": "7777777",
        "city": "Salvador",
        "name": "Hospital Raras-Only",
        "verticals": ["rare_diseases"],
    }
    client = FakeSupabaseClient(
        hospitals=[rare_row],
        specialties=[
            {"hospital_id": 1, "vertical": "rare_diseases", "specialty": "rare_diseases_reference"}
        ],
    )

    # Coordinates absent -> pending; trivial enrichment skipped on purpose.
    for h in hospitals.values():
        h["address"] = "Rua A, 1"
        h["phones"] = None
        h["lat"] = None
        h["lng"] = None

    inserted, updated, removed = upsert_qualification_hospitals(
        client,  # type: ignore[arg-type]
        hospitals,
        vertical="oncology",
    )
    results.append(check("3 inserted, none removed", (inserted, updated, removed) == (3, 0, 0)))
    onco_specialties = [
        s for s in client.tables["hospital_specialties"] if s["vertical"] == "oncology"
    ]
    results.append(
        check("5 oncology specialty rows", len(onco_specialties) == 5, str(len(onco_specialties)))
    )
    with_portaria = [s for s in onco_specialties if s.get("portaria")]
    results.append(
        check(
            "portaria persisted on the radiotherapy row",
            len(with_portaria) == 1 and with_portaria[0]["specialty"] == "isolated_radiotherapy",
        )
    )
    results.append(
        check(
            "rare-diseases rows untouched",
            any(r.get("id") == 1 for r in client.tables["hospitals"])
            and any(
                s["vertical"] == "rare_diseases" for s in client.tables["hospital_specialties"]
            ),
        )
    )

    ok = sum(results)
    print(f"\nResult: {ok}/{len(results)} passed")
    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
