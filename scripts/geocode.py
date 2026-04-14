"""
Geocoding de endereços de hospitais e consulta de CEPs.

Provedores:
  * Nominatim (OpenStreetMap) — endereços → lat/lng. Grátis, 1 req/s.
  * BrasilAPI /cep/v2       — CEP → cidade + (às vezes) lat/lng. Grátis.

Política de rate limit:
  * Respeitamos o rate limit do Nominatim (1 req/s). Um sync inicial de
    ~5k hospitais leva ~1h20min; roda em GitHub Actions sem problema.
  * User-Agent identificado, conforme exigido pelos termos do Nominatim.

Cache em dois níveis:
  1. Em memória (por processo): dict {cache_key → GeocodeResult|None}.
     Evita repetição dentro do mesmo run para hospitais no mesmo município.
  2. Persistente no Supabase (tabela geocode_cache): armazena cada query
     enviada ao Nominatim com seu resultado. Runs futuros consultam o banco
     antes de chamar o Nominatim — essencial para syncs de 500+ hospitais.
     Misses (Nominatim não encontrou) também são cacheados para não repetir
     chamadas inúteis. Para forçar retry de misses:
       DELETE FROM geocode_cache WHERE lat IS NULL;
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Optional

import requests

USER_AGENT = "hospitais-referencia-api/1.0 (+https://github.com/Codar-Sistemas/hospitais-referencia-api)"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
BRASILAPI_CEP_URL = "https://brasilapi.com.br/api/cep/v2/{cep}"

RATE_LIMIT_NOMINATIM_S = 1.1  # um pouco acima de 1s pra margem
REQUEST_TIMEOUT = 15

# Sentinela: distingue "não está no cache" de "está no cache como miss (None)"
_NOT_IN_CACHE = object()


@dataclass
class GeocodeResult:
    lat: float
    lng: float
    fonte: str  # 'nominatim' | 'cache' | 'brasilapi'


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
    """
    Geocoder com rate limit global, cache em memória e cache persistente
    no Supabase.

    Parâmetros opcionais supabase_url / supabase_key habilitam o cache
    persistente. Sem eles, o comportamento é idêntico ao anterior (só memória).
    """

    def __init__(
        self,
        user_agent: str = USER_AGENT,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
    ):
        self._last_nominatim_req = 0.0
        self._mem_cache: dict[str, Optional[GeocodeResult]] = {}
        self._session = requests.Session()
        self._session.headers["User-Agent"] = user_agent

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
    # Rate limit helpers
    # ------------------------------------------------------------------

    def _wait_nominatim(self) -> None:
        elapsed = time.monotonic() - self._last_nominatim_req
        if elapsed < RATE_LIMIT_NOMINATIM_S:
            time.sleep(RATE_LIMIT_NOMINATIM_S - elapsed)
        self._last_nominatim_req = time.monotonic()

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

    def _query_nominatim(self, query: str) -> Optional[GeocodeResult]:
        """
        Consulta o Nominatim com cache persistente:
          1. Verifica geocode_cache no Supabase → retorna se encontrar
          2. Aplica rate limit (1 req/s)
          3. Chama Nominatim
          4. Salva resultado (ou miss) no cache
        """
        # 1. Cache persistente
        cached = self._db_get(query)
        if cached is not _NOT_IN_CACHE:
            return cached  # pode ser None (miss) ou GeocodeResult (hit)

        # 2. Rate limit antes de chamar Nominatim
        self._wait_nominatim()

        # 3. Chamada ao Nominatim
        result: Optional[GeocodeResult] = None
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
            if resp.ok:
                data = resp.json()
                if data:
                    item = data[0]
                    result = GeocodeResult(
                        lat=float(item["lat"]),
                        lng=float(item["lon"]),
                        fonte="nominatim",
                    )
        except (requests.RequestException, ValueError, KeyError):
            pass

        # 4. Persiste no cache (incluindo misses para não repetir)
        self._db_set(query, result)
        return result

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
