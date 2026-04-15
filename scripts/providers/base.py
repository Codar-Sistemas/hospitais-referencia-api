"""
Interfaces abstratas para providers de geocoding e CEP.

Implementações concretas ficam em:
  - nominatim.py       (GeocodingProvider)
  - brasilapi.py       (CepProvider)

Para adicionar um novo provider (ex: Google Maps, OpenCage, ViaCEP),
basta criar uma subclasse que implemente os métodos abstratos.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class GeocodingResult:
    """Resultado de uma operação de geocoding."""
    lat: float
    lng: float
    fonte: str  # nome do provider que resolveu (ex: "nominatim")


@dataclass
class CepLookupResult:
    """Resultado de uma consulta de CEP."""
    cep: str
    logradouro: Optional[str]
    bairro: Optional[str]
    cidade: Optional[str]
    uf: Optional[str]
    lat: Optional[float]
    lng: Optional[float]


class GeocodingProvider(ABC):
    """
    Provider de geocoding: converte uma string de endereço em coordenadas.

    Implementações devem respeitar o rate limit do serviço externo
    internamente (ex: Nominatim = 1 req/s).
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Identificador curto do provider (ex: 'nominatim')."""

    @abstractmethod
    def geocode(self, query: str) -> Optional[GeocodingResult]:
        """
        Resolve a query em coordenadas.

        Retorna GeocodingResult em caso de sucesso, None caso contrário.
        Nunca lança exceção — erros são tratados internamente.
        """


class CepProvider(ABC):
    """
    Provider de consulta de CEP brasileiro.

    Retorna dados do endereço e, quando disponível, coordenadas.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Identificador curto do provider (ex: 'brasilapi')."""

    @abstractmethod
    def lookup(self, cep: str) -> Optional[CepLookupResult]:
        """
        Consulta o CEP. Aceita CEP com ou sem hífen.

        Retorna CepLookupResult em caso de sucesso, None caso contrário.
        Nunca lança exceção.
        """
