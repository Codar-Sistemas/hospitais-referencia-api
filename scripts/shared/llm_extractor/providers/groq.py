"""Groq vision provider — Llama 3.2 / 4 series.

Free tier (2026-02): 14.400 req/day on `llama-3.2-90b-vision-preview`.
Get a key at https://console.groq.com.
"""

from __future__ import annotations

import base64
import os

from groq import Groq

from scripts.shared.llm_extractor.providers.base import LlmExtractionError, LlmReply

DEFAULT_MODEL = "llama-3.2-90b-vision-preview"


class GroqProvider:
    name = "llm_groq"

    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self._model = model
        self._api_key = os.environ.get("GROQ_API_KEY")
        self._client = Groq(api_key=self._api_key) if self._api_key else None

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    def extract(self, *, system: str, user: str, images: list[bytes]) -> LlmReply:
        if not self._client:
            raise LlmExtractionError("GROQ_API_KEY is not set")

        # Groq's vision models accept image_url with data URIs but only
        # one image per request as of 2026-02. We send the first page
        # only and let the pipeline call us per page if needed.
        if not images:
            raise LlmExtractionError("Groq requires at least one image")
        first = images[0]
        data_uri = f"data:image/jpeg;base64,{base64.b64encode(first).decode('ascii')}"

        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user},
                            {"type": "image_url", "image_url": {"url": data_uri}},
                        ],
                    },
                ],
                temperature=0,
            )
        except Exception as e:
            raise LlmExtractionError(f"Groq call failed: {e}") from e

        text = (completion.choices[0].message.content or "").strip()
        if not text:
            raise LlmExtractionError("Groq returned empty body")
        return LlmReply(text=text, provider=self.name, model=self._model)
