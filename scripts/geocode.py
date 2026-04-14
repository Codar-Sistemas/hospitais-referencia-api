"""
Geocoding de endereços de hospitais e consulta de CEPs.

Provedores:
  * Nominatim (OpenStreetMap) — endereços → lat/lng. Grátis, 1 req/s.
  * BrasilAPI /cep/v2       — CEP → cidade + (às vezes) lat/lng. Grátis.

Política:
  * Respeitamos o rate limit do Nominatim (1 req/s). Um sync inicial de
    ~5k hospitais leva ~1h20min; roda em GitHub Actions sem problema.
  * Cache em memória dentro do processo (evita refazer queries repetidas
    em caso de múltiplos hospitais no mesmo endereço).
  * User-Agent identificado, conforme exigido pelos termos do Nominatim.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Optional

import requests

# User-Agent identificado — Nominatim EXIGE isso nos termos de uso.
# Substitua pelo seu domínio/email quando fizer deploy.
USER_AGENT = "hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2/{cep}"

RATE_LIMIT_NOMINATIM_S = 1.1  # um pouco acima de 1s pra margem
REQUEST_TIMEOUT = 15


@dataclass
class GeocodeResult:
    lat: float
    lng: float
    fonte: str  # 'nominatim' | 'brasilapi'


@dataclass
class CepResult:
    cep: str
    logradouro: Optional[str]
    bairro: Optional[str]
    cidade: Optional[str]
    uf: Optional[str]
    lat: Optional[float]
    lng: Optional[float]


class Geocoder:
    """Geocoder com rate limit global e cache em memória."""

    def __init__(self, user_agent: str = USER_AGENT):
        self._last_nominatim_req = 0.0
        self._cache: dict[str, Optional[GeocodeResult]] = {}
        self._session = requests.Session()
        self._session.headers["User-Agent"] = user_agent

    # ------------------------------------------------------------------
    # Rate limit helpers
    # ------------------------------------------------------------------
    def _wait_nominatim(self):
        elapsed = time.monotonic() - self._last_nominatim_req
        if elapsed < RATE_LIMIT_NOMINATIM_S:
            time.sleep(RATE_LIMIT_NOMINATIM_S - elapsed)
        self._last_nominatim_req = time.monotonic()

    # ------------------------------------------------------------------
    # Geocoding de endereço (hospital)
    # ------------------------------------------------------------------
    def geocode_endereco(self, endereco: str, municipio: str, uf: str) -> Optional[GeocodeResult]:
        """
        Geocodifica um endereço brasileiro. Tenta variações progressivamente
        mais amplas até encontrar. Cacheia sucesso e falha.

        Retorna None se não for possível geocodificar.
        """
        if not endereco:
            # Sem endereço detalhado, tenta só "município, UF, Brasil".
            return self._geocode_municipio(municipio, uf)

        cache_key = f"{endereco}|{municipio}|{uf}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Limpa endereço antes de enviar para o geocoder.
        endereco_limpo = _limpar_endereco(endereco)

        # Estratégia: tenta queries cada vez mais amplas.
        tentativas = [
            f"{endereco_limpo}, {municipio}, {uf}, Brasil",
            f"{_so_logradouro(endereco_limpo)}, {municipio}, {uf}, Brasil",
            f"{municipio}, {uf}, Brasil",
        ]

        resultado: Optional[GeocodeResult] = None
        for q in tentativas:
            r = self._query_nominatim(q)
            if r:
                resultado = r
                break

        self._cache[cache_key] = resultado
        return resultado

    def _geocode_municipio(self, municipio: str, uf: str) -> Optional[GeocodeResult]:
        cache_key = f"municipio|{municipio}|{uf}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        r = self._query_nominatim(f"{municipio}, {uf}, Brasil")
        self._cache[cache_key] = r
        return r

    def _query_nominatim(self, query: str) -> Optional[GeocodeResult]:
        self._wait_nominatim()
        try:
            resp = self._session.get(
                NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "br",
                    "addressdetails": 0,
                },
                timeout=REQUEST_TIMEOUT,
            )
            if not resp.ok:
                return None
            data = resp.json()
            if not data:
                return None
            item = data[0]
            return GeocodeResult(
                lat=float(item["lat"]),
                lng=float(item["lon"]),
                fonte="nominatim",
            )
        except (requests.RequestException, ValueError, KeyError):
            return None

    # ------------------------------------------------------------------
    # Consulta de CEP (usada pela API em runtime)
    # ------------------------------------------------------------------
    def consultar_cep(self, cep: str) -> Optional[CepResult]:
        """Consulta CEP na BrasilAPI v2. Retorna None em caso de erro/não-encontrado."""
        cep_limpo = re.sub(r"\D", "", cep or "")
        if len(cep_limpo) != 8:
            return None
        try:
            r = self._session.get(
                BRASILAPI_CEP_URL.format(cep=cep_limpo),
                timeout=REQUEST_TIMEOUT,
            )
            if r.status_code == 404:
                return None
            if not r.ok:
                return None
            data = r.json()
            loc = data.get("location", {}) or {}
            coords = loc.get("coordinates", {}) or {}
            lat = coords.get("latitude")
            lng = coords.get("longitude")
            return CepResult(
                cep=cep_limpo,
                logradouro=data.get("street") or None,
                bairro=data.get("neighborhood") or None,
                cidade=data.get("city") or None,
                uf=data.get("state") or None,
                lat=float(lat) if lat else None,
                lng=float(lng) if lng else None,
            )
        except (requests.RequestException, ValueError):
            return None


# ----------------------------------------------------------------------
# Funções auxiliares de limpeza de endereço
# ----------------------------------------------------------------------
def _limpar_endereco(s: str) -> str:
    """
    Remove ruído comum em endereços de PDFs do MS:
      - "s/n", "s/nº", "Qd. 07", "Km 21"
      - telefones (com ou sem DDD entre parênteses)
      - espaços duplicados
    """
    # Telefones: "(DD) NNNN-NNNN", "(DD)NNNNNNNN", "NNNNN-NNNN", etc.
    s = re.sub(r"\(\d{2,3}\)\s*\d{3,5}[-\s]?\d{3,5}", "", s)
    s = re.sub(r"\b\d{4,5}[-\s]\d{4}\b", "", s)
    s = re.sub(r"\bs/n[ºo°]?\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\(.*?\)", "", s)  # remaining parens
    s = re.sub(r"\s+", " ", s).strip(" ,-")
    return s


def _so_logradouro(s: str) -> str:
    """Mantém só a parte antes do primeiro número/vírgula, ampliando o match."""
    # Ex: "Rua Joaquim Luiz Viana, 209 - Vila Cicma" → "Rua Joaquim Luiz Viana"
    m = re.match(r"([^,0-9]+)", s)
    return m.group(1).strip() if m else s


if __name__ == "__main__":
    # Teste manual rápido
    import sys
    g = Geocoder()
    if len(sys.argv) > 1:
        # geocode CEP
        if sys.argv[1].replace("-", "").isdigit():
            print(g.consultar_cep(sys.argv[1]))
        else:
            # geocode endereço
            print(g.geocode_endereco(sys.argv[1], "São Paulo", "SP"))
