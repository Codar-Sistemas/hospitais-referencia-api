"""Structured output schema for hospital-table extraction.

The LLM is instructed to return JSON matching this shape. Pydantic
validates the reply before it ever reaches the upserter, so a noisy
or incomplete response fails fast with a useful error.
"""

from pydantic import BaseModel, Field


class HospitalRowLLM(BaseModel):
    """One hospital row as the LLM should produce it.

    Field names mirror the PDF columns (Portuguese in the source, but
    we name them in English for the API contract). Values come back
    verbatim from the PDF — the Python pipeline canonicalises
    `treatments_raw` into the English `treatments` list afterwards,
    keeping the LLM's task as narrow as possible.
    """

    city: str = Field(..., description="Município (column 1).")
    name: str | None = Field(None, description="Unidade de Saúde (column 2).")
    address: str | None = Field(None, description="Endereço (column 3).")
    phones: str | None = Field(None, description="Telefones (column 4).")
    cnes: str | None = Field(None, description="CNES — 7 digits (column 5).")
    treatments_raw: str | None = Field(
        None,
        description="Atendimentos — verbatim Portuguese cell (column 6).",
    )


class HospitalTableLLM(BaseModel):
    """Top-level reply: the full table extracted from one PDF page."""

    rows: list[HospitalRowLLM] = Field(default_factory=list)
