"""Provider protocol for vision-capable LLM extractors.

Every provider takes the same inputs (system + user text, image
bytes) and returns the raw model reply as a string. The pipeline
parses + validates that string against the Pydantic schema; the
provider doesn't have to know about the target shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LlmReply:
    """One successful provider call."""

    text: str
    provider: str
    model: str


class LlmExtractionError(Exception):
    """Raised by a provider when the call fails or returns nothing usable."""


class LlmProvider(Protocol):
    """Stable surface for every vision LLM backend."""

    @property
    def name(self) -> str:
        """Stable identifier persisted into `extraction_source`."""

    @property
    def is_configured(self) -> bool:
        """True when the necessary API key is in the environment."""

    def extract(
        self,
        *,
        system: str,
        user: str,
        images: list[bytes],
    ) -> LlmReply:
        """Send the prompt + images to the model and return the raw reply.

        Raises `LlmExtractionError` if the request fails or the reply is
        empty. The pipeline catches that and moves to the next provider.
        """
