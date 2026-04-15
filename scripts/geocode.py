"""
Orquestração de geocoding e consulta de CEP.

Este módulo NÃO implementa chamadas HTTP diretamente — delega para
providers plugáveis definidos em `scripts/providers/`. Ver base.py
para as interfaces abstratas.

Responsabilidades do Geocoder:
  1. Rate limit global (delegado ao NominatimProvider)
  2. Cache em memória (dict por processo)
  3. Cache persistente no Supabase (tabela geocode_cache)
  4. Estratégia progressiva de fallback (endereço → logradouro → município)

Provedores default:
  * NominatimProvider (OpenStreetMap) — endereços → lat/lng
  * BrasilApiCepProvider — CEP → cidade + coordenadas

Para trocar de provider, passe instâncias customizadas no construtor:

    geo = Geocoder(
        geocoding_provider=MyGoogleMapsProvider(api_key="..."),
        cep_provider=ViaCepProvider(),
    )

Cache em dois níveis (mantido como antes):
  1. Memória (por processo): dict {cache_key → GeocodingResult|None}.
  2. Supabase (tabela geocode_cache): persistente entre runs. Misses
     também são cacheados para evitar chamadas repetidas ao Nominatim.
     Para forçar retry de misses: DELETE FROM geocode_cache WHERE lat IS NULL;
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import requests

from scripts.providers import (
    BrasilApiCepProvider,
    CepLookupResult,
    CepProvider,
    GeocodingProvider,
    GeocodingResult,
    NominatimProvider,
)

USER_AGENT = "hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)"

# Sentinela: distingue "não está no cache" de "está no cache como miss (None)"
_NOT_IN_CACHE = object()


# Aliases para manter compatibilidade com código legado que importa estes nomes.
# Os tipos concretos vivem agora em scripts/providers/base.py.
GeocodeResult = GeocodingResult
CepResult = CepLookupResult


class Geocoder:
    """
    Orquestrador de geocoding com rate limit, cache em memória e cache persistente.

    Aceita providers plugáveis via injeção de dependência:
      * geocoding_provider → resolve endereço em coordenadas
      * cep_provider       → resolve CEP em dados de endereço

    Se não forem passados, usa NominatimProvider e BrasilApiCepProvider
    como defaults (comportamento idêntico ao legado).

    Parâmetros supabase_url / supabase_key habilitam o cache persistente.
    Sem eles, só o cache em memória é usado.
    """

    def __init__(
        self,
        user_agent: str = USER_AGENT,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
        geocoding_provider: Optional[GeocodingProvider] = None,
        cep_provider: Optional[CepProvider] = None,
    ):
        self._mem_cache: dict[str, Optional[GeocodingResult]] = {}
        self._session = requests.Session()
        self._session.headers["User-Agent"] = user_agent

        # Providers com defaults (Nominatim + BrasilAPI) usando a mesma session
        self._geo_provider: GeocodingProvider = (
            geocoding_provider
            or NominatimProvider(session=self._session, user_agent=user_agent)
        )
        self._cep_provider: CepProvider = (
            cep_provider or BrasilApiCepProvider(session=self._session)
        )

        # Cache persistente (opcional)
        self._sb_url = supabase_url.rstrip("/") if supabase_url else None
        self._sb_headers: Optional[dict] = None
        if supabase_url and supabase_key:
            self._sb_headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }

    # ------------------------------------------------------------------
    # Cache persistente (Supabase → tabela geocode_cache)
    # ------------------------------------------------------------------

    def _db_get(self, query_key: str):
        """
        Consulta geocode_cache no Supabase.

        Retorna:
          _NOT_IN_CACHE  — entrada não existe no banco
          None           — entrada existe, mas é um miss confirmado (lat IS NULL)
          GeocodeResult  — entrada existe com coordenadas
        """
        if not self._sb_url or not self._sb_headers:
            return _NOT_IN_CACHE
        try:
            r = self._session.get(
                f"{self._sb_url}/rest/v1/geocode_cache",
                headers=self._sb_headers,
                params={"query_key": f"eq.{query_key}", "select": "lat,lng,fonte"},
                timeout=10,
            )
            if r.ok:
                rows = r.json()
                if rows:
                    row = rows[0]
                    # Atualiza hit_count e ultimo_hit de forma assíncrona (fire-and-forget)
                    self._db_touch(query_key)
                    if row["lat"] is not None and row["lng"] is not None:
                        return GeocodeResult(
                            lat=float(row["lat"]),
                            lng=float(row["lng"]),
                            fonte="cache",
                        )
                    return None  # miss confirmado
        except Exception:
            pass  # falha no cache não bloqueia o geocoding
        return _NOT_IN_CACHE

    def _db_set(self, query_key: str, result: Optional[GeocodeResult]) -> None:
        """Salva resultado (ou miss) na tabela geocode_cache."""
        if not self._sb_url or not self._sb_headers:
            return
        try:
            self._session.post(
                f"{self._sb_url}/rest/v1/geocode_cache",
                headers=self._sb_headers,
                params={"on_conflict": "query_key"},
                json={
                    "query_key": query_key,
                    "lat": result.lat if result else None,
                    "lng": result.lng if result else None,
                    "fonte": result.fonte if result else None,
                },
                timeout=10,
            )
        except Exception:
            pass  # escrita no cache é melhor-esforço

    def _db_touch(self, query_key: str) -> None:
        """Incrementa hit_count e atualiza ultimo_hit (fire-and-forget)."""
        if not self._sb_url or not self._sb_headers:
            return
        try:
            # Usa RPC se disponível; senão, faz PATCH simples
            self._session.patch(
                f"{self._sb_url}/rest/v1/geocode_cache",
                headers={**self._sb_headers, "Prefer": "return=minimal"},
                params={"query_key": f"eq.{query_key}"},
                json={"ultimo_hit": "now()"},
                timeout=5,
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Geocoding de endereço (hospital)
    # ------------------------------------------------------------------

    def geocode_endereco(
        self, endereco: str, municipio: str, uf: str
    ) -> Optional[GeocodeResult]:
        """
        Geocodifica um endereço brasileiro. Tenta variações progressivamente
        mais amplas até encontrar. Usa cache em dois níveis (memória + Supabase).

        Retorna None se não for possível geocodificar.
        """
        if not endereco:
            return self._geocode_municipio(municipio, uf)

        mem_key = f"{endereco}|{municipio}|{uf}"
        if mem_key in self._mem_cache:
            return self._mem_cache[mem_key]

        endereco_limpo = _limpar_endereco(endereco)

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

        self._mem_cache[mem_key] = resultado
        return resultado

    def _geocode_municipio(self, municipio: str, uf: str) -> Optional[GeocodeResult]:
        mem_key = f"municipio|{municipio}|{uf}"
        if mem_key in self._mem_cache:
            return self._mem_cache[mem_key]
        r = self._query_nominatim(f"{municipio}, {uf}, Brasil")
        self._mem_cache[mem_key] = r
        return r

    def _query_nominatim(self, query: str) -> Optional[GeocodingResult]:
        """
        Consulta o provider de geocoding com cache persistente.

        O nome mantém `_nominatim` por compatibilidade com testes existentes
        e histórico de código, mas internamente delega para
        self._geo_provider — que pode ser qualquer GeocodingProvider.

        Fluxo:
          1. Verifica geocode_cache no Supabase → retorna se encontrar
          2. Chama o provider (ele cuida do rate limit internamente)
          3. Salva resultado (ou miss) no cache
        """
        # 1. Cache persistente
        cached = self._db_get(query)
        if cached is not _NOT_IN_CACHE:
            return cached  # pode ser None (miss) ou GeocodingResult (hit)

        # 2. Delega para o provider (rate limit fica dentro dele)
        result = self._geo_provider.geocode(query)

        # 3. Persiste no cache (incluindo misses para não repetir)
        self._db_set(query, result)
        return result

    # ------------------------------------------------------------------
    # Consulta de CEP (usada pela API em runtime)
    # ------------------------------------------------------------------

    def consultar_cep(self, cep: str) -> Optional[CepLookupResult]:
        """
        Delega para o CepProvider configurado (default: BrasilAPI).

        Retorna None em caso de erro, CEP inválido ou não encontrado.
        """
        cep_limpo = re.sub(r"\D", "", cep or "")
        if len(cep_limpo) != 8:
            return None
        return self._cep_provider.lookup(cep_limpo)


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
    s = re.sub(r"\(\d{2,3}\)\s*\d{3,5}[-\s]?\d{3,5}", "", s)
    s = re.sub(r"\b\d{4,5}[-\s]\d{4}\b", "", s)
    s = re.sub(r"\bs/n[ºo°]?\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,-")
    return s


def _so_logradouro(s: str) -> str:
    """Mantém só a parte antes do primeiro número/vírgula, ampliando o match."""
    m = re.match(r"([^,0-9]+)", s)
    return m.group(1).strip() if m else s


if __name__ == "__main__":
    import sys
    g = Geocoder()
    if len(sys.argv) > 1:
        if sys.argv[1].replace("-", "").isdigit():
            print(g.consultar_cep(sys.argv[1]))
        else:
            print(g.geocode_endereco(sys.argv[1], "São Paulo", "SP"))
