"""Heuristic confidence score for an LLM extraction.

Vision LLMs don't expose per-token confidence the way Tesseract does,
so we approximate trustworthiness from structural sanity of the
returned table. The score is comparable to Tesseract's `ocr_confidence`
(0-100) and shares the same downstream meaning: rows below 70 wear the
"manual verification" badge in the UI.

Signals chosen for being **objectively verifiable** without consulting
the PDF again:

  - CNES is a 7-digit string by spec — easy to validate.
  - Treatments must canonicalise to the English vocabulary; an LLM
    hallucination usually produces unknown values that the normaliser
    rejects.
  - Hospital name and address are nullable in the source data, so we
    weight them less and treat absence as soft evidence, not failure.
"""

from __future__ import annotations

import re

from scripts.shared.types import HospitalRecord

_CNES_RE = re.compile(r"^\d{7}$")

# Sum to 1.0. CNES and treatments dominate because they're the only
# fields with a strict, machine-checkable form.
_WEIGHTS = {
    "cnes_well_formed": 0.30,
    "treatments_recognised": 0.30,
    "name_present": 0.25,
    "address_present": 0.15,
}


def compute_extraction_confidence(records: list[HospitalRecord]) -> int:
    """Return a 0-100 score for the extraction quality.

    An empty result is 0 by definition (the LLM produced nothing
    usable). Otherwise the score is the weighted average of four
    per-row signals, rounded to the nearest integer.
    """
    if not records:
        return 0

    n = len(records)
    cnes_well_formed = sum(1 for r in records if r["cnes"] and _CNES_RE.match(r["cnes"])) / n
    treatments_recognised = sum(1 for r in records if r["treatments"]) / n
    name_present = sum(1 for r in records if r["name"]) / n
    address_present = sum(1 for r in records if r["address"]) / n

    score = (
        cnes_well_formed * _WEIGHTS["cnes_well_formed"]
        + treatments_recognised * _WEIGHTS["treatments_recognised"]
        + name_present * _WEIGHTS["name_present"]
        + address_present * _WEIGHTS["address_present"]
    )
    return round(score * 100)
