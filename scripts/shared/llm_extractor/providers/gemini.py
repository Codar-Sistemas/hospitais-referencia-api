"""Google Gemini vision provider — uses the supported `google-genai` SDK.

Free tier (2026-02): 1500 req/day, 15 req/min, 1M tokens/min on
`gemini-2.0-flash`. Get a key at https://aistudio.google.com/apikey.
"""

from __future__ import annotations

import os

from google import genai
from google.genai import types

from scripts.shared.llm_extractor.providers.base import LlmExtractionError, LlmReply

DEFAULT_MODEL = "gemini-2.0-flash"


class GeminiProvider:
    name = "llm_gemini"

    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self._model = model
        self._api_key = os.environ.get("GEMINI_API_KEY")
        # Client is constructed lazily so an unconfigured provider can be
        # listed in the chain without raising at import time.
        self._client = genai.Client(api_key=self._api_key) if self._api_key else None

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    def extract(self, *, system: str, user: str, images: list[bytes]) -> LlmReply:
        if not self._client:
            raise LlmExtractionError("GEMINI_API_KEY is not set")

        parts: list[types.Part] = [types.Part.from_text(text=user)]
        parts.extend(types.Part.from_bytes(data=image, mime_type="image/jpeg") for image in images)
        content = types.Content(role="user", parts=parts)

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=content,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=0,
                ),
            )
        except Exception as e:
            raise LlmExtractionError(f"Gemini call failed: {e}") from e

        text = (response.text or "").strip()
        if not text:
            raise LlmExtractionError("Gemini returned empty body")
        return LlmReply(text=text, provider=self.name, model=self._model)
