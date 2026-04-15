"""
Camada de abstração para providers externos (geocoding e CEP).

Cada provider implementa uma interface simples e pode ser substituído
sem tocar no código de orquestração (rate limit, cache, lógica de retry).

Uso típico:

    from scripts.providers import NominatimProvider, BrasilApiCepProvider

    geo = NominatimProvider(session, user_agent="meu-app/1.0")
    result = geo.geocode("Avenida Paulista, São Paulo, SP, Brasil")

    cep = BrasilApiCepProvider(session)
    data = cep.lookup("01310100")
"""
from scripts.providers.base import (
    CepLookupResult,
    CepProvider,
    GeocodingProvider,
    GeocodingResult,
)
from scripts.providers.nominatim import NominatimProvider
from scripts.providers.brasilapi import BrasilApiCepProvider

__all__ = [
    "GeocodingProvider",
    "GeocodingResult",
    "CepProvider",
    "CepLookupResult",
    "NominatimProvider",
    "BrasilApiCepProvider",
]
