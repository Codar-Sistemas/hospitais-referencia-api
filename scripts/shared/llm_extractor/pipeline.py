"""Orchestrates the fallback chain.

Each call:
    1. preprocess the PDF into JPEG pages
    2. try each configured provider in order
    3. parse the reply as JSON and validate with Pydantic
    4. return canonical HospitalRecord rows (treatments included)

Failures inside a provider (network, rate-limit, bad JSON) move on to
the next provider rather than aborting. Only when every provider fails
do we raise, so the caller can fall back to Tesseract.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import ValidationError

from scripts.parsing.text_parser import normalize_treatments
from scripts.shared.llm_extractor.metrics import compute_extraction_confidence
from scripts.shared.llm_extractor.preprocessing import PreprocessConfig, pdf_to_images
from scripts.shared.llm_extractor.providers.base import LlmExtractionError, LlmProvider
from scripts.shared.llm_extractor.schemas.hospital_table import HospitalTableLLM
from scripts.shared.logger import log
from scripts.shared.types import HospitalRecord


@dataclass(frozen=True)
class ExtractionOutcome:
    """What a successful run produced — used by the caller to record
    `extraction_source`, decide whether the records need the manual-
    verification badge, and feed run telemetry."""

    records: list[HospitalRecord]
    provider: str
    model: str
    confidence: int  # 0-100 — heuristic, comparable to Tesseract's value


class AllProvidersFailedError(Exception):
    """Every configured provider raised — caller should try Tesseract."""

    def __init__(self, attempts: list[tuple[str, str]]) -> None:
        # (provider_name, error_message) for each failed attempt
        self.attempts = attempts
        joined = "; ".join(f"{name}: {err}" for name, err in attempts)
        super().__init__(f"all LLM providers failed: {joined}")


def extract_hospitals(
    *,
    pdf_path: str,
    state_code: str,
    system_prompt: str,
    user_prompt: str,
    providers: list[LlmProvider],
    preprocess: PreprocessConfig = PreprocessConfig(),
) -> ExtractionOutcome:
    """Run the fallback chain against a PDF and return canonical rows."""

    configured = [p for p in providers if p.is_configured]
    if not configured:
        raise AllProvidersFailedError([("config", "no provider configured")])

    images = pdf_to_images(pdf_path, preprocess)
    if not images:
        raise AllProvidersFailedError([("preprocess", "no pages rendered")])

    attempts: list[tuple[str, str]] = []
    for provider in configured:
        try:
            reply = provider.extract(
                system=system_prompt,
                user=user_prompt,
                images=images,
            )
        except LlmExtractionError as e:
            log(f"{provider.name} failed: {e}", state_code=state_code)
            attempts.append((provider.name, str(e)))
            continue

        records = _parse_and_canonicalise(reply.text, state_code)
        if records is None:
            attempts.append((provider.name, "invalid JSON or schema"))
            continue

        confidence = compute_extraction_confidence(records)
        log(
            f"{provider.name} ({reply.model}) extracted {len(records)} rows "
            f"(confidence: {confidence}%)",
            state_code=state_code,
        )
        return ExtractionOutcome(
            records=records,
            provider=provider.name,
            model=reply.model,
            confidence=confidence,
        )

    raise AllProvidersFailedError(attempts)


def _parse_and_canonicalise(reply_text: str, state_code: str) -> list[HospitalRecord] | None:
    """Parse + validate the LLM reply, then attach state_code and
    canonical treatments. Returns None if parsing or validation fails.
    """
    raw = _strip_code_fences(reply_text)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    try:
        table = HospitalTableLLM.model_validate(data)
    except ValidationError:
        return None

    return [
        {
            "state_code": state_code,
            "city": row.city,
            "name": row.name,
            "address": row.address,
            "phones": row.phones,
            "cnes": row.cnes,
            "treatments_raw": row.treatments_raw,
            "treatments": normalize_treatments(row.treatments_raw),
        }
        for row in table.rows
    ]


def _strip_code_fences(text: str) -> str:
    """Some models wrap JSON in ```json … ``` despite being told not to."""
    stripped = text.strip()
    if stripped.startswith("```"):
        # Drop the opening fence (with optional language tag) and the closing one.
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped
