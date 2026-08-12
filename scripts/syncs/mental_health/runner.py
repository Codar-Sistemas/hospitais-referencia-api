"""
mental_health vertical sync — CAPS (Centros de Atenção Psicossocial).

The first fully CNES-first vertical (fase 2 do roadmap): no PDF, no OCR.

  1. DEMAS open-data API lists every unit of type 70 (address, phone,
     official lat/lng, 13-digit CO_UNIDADE);
  2. the cnes.datasus site service resolves, per unit, the SUBTYPE
     (CAPS I/II/III/AD/i) plus city/state as text;
  3. the shared qualification engine upserts rows + specialties under
     `vertical = mental_health`, `extraction_source = cnes_api`.

Guardrails: the DEMAS listing raises on failure (never truncates), and the
sync aborts when subtype/detail misses exceed MAX_DETAIL_MISS_RATIO — a
half-resolved dataset would look like mass CAPS closures downstream.

Environment: SUPABASE_URL, SUPABASE_SERVICE_KEY (+ SUPABASE_REST_URL for a
local PostgREST override).
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime
from typing import Any

from scripts.providers.cnes_api import CnesApiProvider, CnesListedEstablishment
from scripts.providers.cnes_site import CnesSiteDetails, CnesSiteProvider
from scripts.shared.config import (
    BRAZIL_STATE_CODES,
    EXTRACTION_SOURCE_CNES_API,
    VERTICAL_MENTAL_HEALTH,
)
from scripts.shared.db import SupabaseClient
from scripts.shared.logger import log
from scripts.shared.qualification_sync import upsert_qualification_hospitals
from scripts.shared.types import QualificationHospital, SpecialtyEntry
from scripts.syncs.mental_health.subtipos import resolve_caps_subtype

CAPS_UNIT_TYPE_CODE = 70
SOURCE_URL = "https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_tipo_unidade=70"

# Acima disso o dataset está meio-resolvido e o diff pareceria fechamento em
# massa — melhor abortar e manter o snapshot anterior.
MAX_DETAIL_MISS_RATIO = 0.2


def collect(
    api: CnesApiProvider | None = None,
    site: CnesSiteProvider | None = None,
) -> dict[str, QualificationHospital]:
    api = api or CnesApiProvider()
    site = site or CnesSiteProvider()

    listed = api.list_by_unit_type(CAPS_UNIT_TYPE_CODE)
    log(f"DEMAS listou {len(listed)} unidades tipo {CAPS_UNIT_TYPE_CODE}", state_code="BR")

    hospitals: dict[str, QualificationHospital] = {}
    # Separados de propósito: `detail_misses` mede a saúde do site do CNES
    # (transiente — é o que o guardrail vigia); `dropped` é dado ruim raro
    # (sem CO_UNIDADE, UF fora do conjunto), que só se registra.
    detail_misses = 0
    dropped = 0
    now = datetime.now(UTC).isoformat()

    for row in listed:
        if not row.cnes or not row.unit_code:
            log(f"unidade sem CNES/CO_UNIDADE utilizável: {row.name}", state_code="BR")
            dropped += 1
            continue

        details = site.fetch_details(row.unit_code)
        if details is None:
            log(f"sem detalhe no site do CNES para {row.cnes} ({row.name})", state_code="BR")
            detail_misses += 1
            continue

        hospital = _assemble(row, details, now)
        if hospital is None:
            dropped += 1
            continue
        hospitals[hospital["cnes"]] = hospital

    if listed and detail_misses > len(listed) * MAX_DETAIL_MISS_RATIO:
        raise RuntimeError(
            f"{detail_misses}/{len(listed)} unidades sem detalhe no site do CNES — "
            f"acima do limite de {MAX_DETAIL_MISS_RATIO:.0%}, abortando para "
            f"não gravar um dataset meio-resolvido"
        )

    log(
        f"{len(hospitals)} CAPS resolvidos ({detail_misses} sem detalhe, {dropped} descartados)",
        state_code="BR",
    )
    return hospitals


def _assemble(
    row: CnesListedEstablishment,
    details: CnesSiteDetails,
    now: str,
) -> QualificationHospital | None:
    if not details.uf or not details.city:
        log(f"detalhe sem UF/município para {row.cnes} ({row.name})", state_code="BR")
        return None

    if details.uf not in BRAZIL_STATE_CODES:
        log(f"UF desconhecida '{details.uf}' para {row.cnes}", state_code="BR")
        return None

    specialties: list[SpecialtyEntry] = []
    subtype_key = resolve_caps_subtype(details.subtype)
    if subtype_key is not None:
        metadata: dict[str, Any] = {"ds_stp_unidade": details.subtype}
        specialties.append(
            {
                "specialty": subtype_key,
                "habilitado_em": None,
                "source_url": SOURCE_URL,
                "metadata": {**metadata, "resolved_at": now},
            }
        )
    elif details.subtype:
        log(
            f"subtipo desconhecido '{details.subtype}' para {row.cnes} — "
            f"mantido na vertical sem especialidade",
            state_code="BR",
        )

    return {
        "state_code": details.uf,
        "city": details.city,
        "name": row.name or details.name or f"CAPS {row.cnes}",
        "cnes": row.cnes,
        "address": row.address,
        "phones": row.phone,
        "lat": row.lat,
        "lng": row.lng,
        "specialties": specialties,
    }


def sync(client: SupabaseClient, hospitals: dict[str, QualificationHospital]) -> None:
    inserted, updated, removed = upsert_qualification_hospitals(
        client,
        hospitals,
        vertical=VERTICAL_MENTAL_HEALTH,
        extraction_source=EXTRACTION_SOURCE_CNES_API,
    )
    log(
        f"mental_health: +{inserted} novos, ~{updated} atualizados, -{removed} removidos",
        state_code="BR",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync CAPS (mental_health) from the CNES.")
    parser.add_argument("command", choices=["sync", "collect"], help="collect = dry-run sem gravar")
    args = parser.parse_args()

    hospitals = collect()

    if args.command == "collect":
        by_subtype: dict[str, int] = {}
        for hospital in hospitals.values():
            for entry in hospital["specialties"]:
                by_subtype[entry["specialty"]] = by_subtype.get(entry["specialty"], 0) + 1
        log(f"[collect] {len(hospitals)} CAPS; por subtipo: {by_subtype}", state_code="BR")
        return

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    rest_base = os.environ.get("SUPABASE_REST_URL")  # local PostgREST override
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(1)

    sync(SupabaseClient(url, key, rest_base=rest_base), hospitals)


if __name__ == "__main__":
    main()
