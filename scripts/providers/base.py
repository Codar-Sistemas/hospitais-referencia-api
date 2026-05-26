"""
Abstract interfaces for geocoding and CEP providers.

Concrete implementations:
  - nominatim.py       (GeocodingProvider)
  - brasilapi.py       (CepProvider)

To plug in another provider (Google Maps, OpenCage, ViaCEP, ...), subclass
the appropriate interface and pass it to the Geocoder.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class GeocodingResult:
    """Result of a geocoding lookup."""

    lat: float
    lng: float
    source: str  # provider identifier (e.g. "nominatim")


@dataclass
class CepLookupResult:
    """Result of a CEP (Brazilian postal code) lookup."""

    cep: str
    street: str | None
    neighborhood: str | None
    city: str | None
    state_code: str | None
    lat: float | None
    lng: float | None


class GeocodingProvider(ABC):
    """
    Geocoding provider: resolves an address string to coordinates.

    Implementations must respect the rate limit of the external service
    internally (e.g. Nominatim caps at 1 req/s).
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Short provider identifier (e.g. 'nominatim')."""

    @abstractmethod
    def geocode(self, query: str) -> GeocodingResult | None:
        """Resolve `query` to coordinates. Returns None on failure. Never raises."""


class CepProvider(ABC):
    """Lookup provider for Brazilian CEPs."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Short provider identifier (e.g. 'brasilapi')."""

    @abstractmethod
    def lookup(self, cep: str) -> CepLookupResult | None:
        """Look up a CEP (with or without hyphen). Returns None on failure. Never raises."""
