"""
Provider abstraction for external services (geocoding and CEP).

Each provider implements a small interface and can be swapped without
touching orchestration logic (rate limiting, caching, retry strategy).

Example:

    from scripts.providers import NominatimProvider, BrasilApiCepProvider

    geo = NominatimProvider(session, user_agent="my-app/1.0")
    result = geo.geocode("Avenida Paulista, Sao Paulo, SP, Brasil")

    cep = BrasilApiCepProvider(session)
    data = cep.lookup("01310100")
"""

from scripts.providers.base import (
    CepLookupResult,
    CepProvider,
    GeocodingProvider,
    GeocodingResult,
)
from scripts.providers.brasilapi import BrasilApiCepProvider
from scripts.providers.nominatim import NominatimProvider

__all__ = [
    "BrasilApiCepProvider",
    "CepLookupResult",
    "CepProvider",
    "GeocodingProvider",
    "GeocodingResult",
    "NominatimProvider",
]
