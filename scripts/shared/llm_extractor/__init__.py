"""Vision-LLM extractor with provider fallback chain.

Typical use from a vertical sync:

    from scripts.shared.llm_extractor import extract_venomous_animals_pdf

    try:
        outcome = extract_venomous_animals_pdf(pdf_path, state_code)
        records = outcome.records
        extraction_source = outcome.provider  # 'llm_gemini' or 'llm_groq'
    except AllProvidersFailedError:
        # Fall back to Tesseract or fail the sync.
        ...
"""

from __future__ import annotations

from scripts.shared.llm_extractor.pipeline import (
    AllProvidersFailedError,
    ExtractionOutcome,
    extract_hospitals,
)
from scripts.shared.llm_extractor.prompts import venomous_animals
from scripts.shared.llm_extractor.providers.base import LlmProvider
from scripts.shared.llm_extractor.providers.gemini import GeminiProvider
from scripts.shared.llm_extractor.providers.groq import GroqProvider


def default_providers() -> list[LlmProvider]:
    """Fallback order honoured by the entry-point helpers below.

    Gemini is first because its free quota is the most generous and its
    table accuracy is the highest in our tests. Groq is the fallback —
    same family of capabilities, different rate-limit pool, so the two
    almost never fail in tandem.
    """
    return [GeminiProvider(), GroqProvider()]


def extract_venomous_animals_pdf(
    pdf_path: str,
    state_code: str,
    *,
    providers: list[LlmProvider] | None = None,
) -> ExtractionOutcome:
    """Convenience wrapper for the venomous-animals vertical."""
    return extract_hospitals(
        pdf_path=pdf_path,
        state_code=state_code,
        system_prompt=venomous_animals.SYSTEM,
        user_prompt=venomous_animals.USER,
        providers=providers or default_providers(),
    )


__all__ = [
    "AllProvidersFailedError",
    "ExtractionOutcome",
    "GeminiProvider",
    "GroqProvider",
    "LlmProvider",
    "default_providers",
    "extract_hospitals",
    "extract_venomous_animals_pdf",
]
