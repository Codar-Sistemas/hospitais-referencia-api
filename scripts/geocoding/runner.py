"""
Geocoding orchestration and CEP lookup.

This module does not call HTTP services directly — it delegates to the
pluggable providers in `scripts/providers/`. See `providers/base.py`
for the abstract interfaces.

Geocoder responsibilities:
  1. Rate limit (delegated to the GeocodingProvider).
  2. In-memory cache (one dict per process).
  3. Persistent cache on Supabase (`geocoding_cache` table).
  4. Progressive fallback (full address -> street -> city).

To swap providers:

    geo = Geocoder(
        geocoding_provider=MyGoogleMapsProvider(api_key="..."),
        cep_provider=ViaCepProvider(),
    )

Cache behavior:
  - Misses are also cached (lat IS NULL) to avoid repeated upstream calls.
  - Force a retry with: DELETE FROM geocoding_cache WHERE lat IS NULL;
"""

from __future__ import annotations

import os
import re
from typing import Any

import requests

from scripts.geocoding.address_normalizer import clean_address, street_only
from scripts.providers import (
    BrasilApiCepProvider,
    CepLookupResult,
    CepProvider,
    GeocodingProvider,
    GeocodingResult,
    NominatimProvider,
)
from scripts.shared.config import USER_AGENT

# Sentinel: distinguishes "not in cache" from "cached as a confirmed miss".
_NOT_IN_CACHE = object()


class Geocoder:
    """
    Geocoding orchestrator with rate limiting and two-level caching.

    Accepts pluggable providers (dependency injection):
      * geocoding_provider — resolves address -> coordinates
      * cep_provider       — resolves CEP -> address data

    Defaults to NominatimProvider + BrasilApiCepProvider.

    Pass `supabase_url` / `supabase_key` to enable the persistent cache.
    Without them, only the in-memory cache is used.
    """

    def __init__(
        self,
        user_agent: str = USER_AGENT,
        supabase_url: str | None = None,
        supabase_key: str | None = None,
        geocoding_provider: GeocodingProvider | None = None,
        cep_provider: CepProvider | None = None,
    ):
        self._memory_cache: dict[str, GeocodingResult | None] = {}
        self._session = requests.Session()
        self._session.headers["User-Agent"] = user_agent

        self._geocoding_provider: GeocodingProvider = geocoding_provider or NominatimProvider(
            session=self._session, user_agent=user_agent
        )
        self._cep_provider: CepProvider = cep_provider or BrasilApiCepProvider(
            session=self._session
        )

        self._supabase_url = supabase_url.rstrip("/") if supabase_url else None
        # Managed Supabase exposes REST at <url>/rest/v1; local PostgREST at <url>/.
        rest_override = os.environ.get("SUPABASE_REST_URL")
        self._rest_base = (
            rest_override.rstrip("/")
            if rest_override
            else (f"{self._supabase_url}/rest/v1" if self._supabase_url else None)
        )
        self._supabase_headers: dict[str, Any] | None = None
        if supabase_url and supabase_key:
            self._supabase_headers = {
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            }

    # ------------------------------------------------------------------
    # Persistent cache (Supabase `geocoding_cache` table)
    # ------------------------------------------------------------------

    def _db_get(self, query_key: str) -> GeocodingResult | object | None:
        """
        Returns:
            _NOT_IN_CACHE  — no row for this key
            None           — row exists but is a confirmed miss (lat IS NULL)
            GeocodingResult — cached hit
        """
        if not self._supabase_url or not self._supabase_headers:
            return _NOT_IN_CACHE
        try:
            response = self._session.get(
                f"{self._rest_base}/geocoding_cache",
                headers=self._supabase_headers,
                params={"query_key": f"eq.{query_key}", "select": "lat,lng,source"},
                timeout=10,
            )
            if response.ok:
                rows = response.json()
                if rows:
                    row = rows[0]
                    self._db_touch(query_key)
                    if row["lat"] is not None and row["lng"] is not None:
                        return GeocodingResult(
                            lat=float(row["lat"]),
                            lng=float(row["lng"]),
                            source="cache",
                        )
                    return None  # confirmed miss
        except Exception:
            pass  # cache failure must never block geocoding
        return _NOT_IN_CACHE

    def _db_set(self, query_key: str, result: GeocodingResult | None) -> None:
        if not self._supabase_url or not self._supabase_headers:
            return
        try:
            self._session.post(
                f"{self._rest_base}/geocoding_cache",
                headers=self._supabase_headers,
                params={"on_conflict": "query_key"},
                json={
                    "query_key": query_key,
                    "lat": result.lat if result else None,
                    "lng": result.lng if result else None,
                    "source": result.source if result else None,
                },
                timeout=10,
            )
        except Exception:
            pass  # best-effort write

    def _db_touch(self, query_key: str) -> None:
        """Increment hit_count and update last_hit_at (fire-and-forget)."""
        if not self._supabase_url or not self._supabase_headers:
            return
        try:
            self._session.patch(
                f"{self._rest_base}/geocoding_cache",
                headers={**self._supabase_headers, "Prefer": "return=minimal"},
                params={"query_key": f"eq.{query_key}"},
                json={"last_hit_at": "now()"},
                timeout=5,
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Address geocoding (hospital row)
    # ------------------------------------------------------------------

    def geocode_address(self, address: str, city: str, state_code: str) -> GeocodingResult | None:
        """
        Geocode a Brazilian address, falling back to progressively wider
        queries until a hit is found. Uses two-level caching.

        Returns None if nothing could be resolved.
        """
        if not address:
            return self._geocode_city(city, state_code)

        memory_key = f"{address}|{city}|{state_code}"
        if memory_key in self._memory_cache:
            return self._memory_cache[memory_key]

        cleaned = clean_address(address)

        attempts = [
            f"{cleaned}, {city}, {state_code}, Brasil",
            f"{street_only(cleaned)}, {city}, {state_code}, Brasil",
            f"{city}, {state_code}, Brasil",
        ]

        result: GeocodingResult | None = None
        for query in attempts:
            hit = self._query_provider(query)
            if hit:
                result = hit
                break

        self._memory_cache[memory_key] = result
        return result

    def _geocode_city(self, city: str, state_code: str) -> GeocodingResult | None:
        memory_key = f"city|{city}|{state_code}"
        if memory_key in self._memory_cache:
            return self._memory_cache[memory_key]
        result = self._query_provider(f"{city}, {state_code}, Brasil")
        self._memory_cache[memory_key] = result
        return result

    def _query_provider(self, query: str) -> GeocodingResult | None:
        """
        Query the geocoding provider through the persistent cache.

          1. Check `geocoding_cache` in Supabase.
          2. On miss, call the provider (rate limit is internal to it).
          3. Persist the outcome (hit or miss) to avoid re-querying.
        """
        cached = self._db_get(query)
        if cached is not _NOT_IN_CACHE:
            # By construction `_db_get` returns either GeocodingResult, None,
            # or the _NOT_IN_CACHE sentinel — already filtered above.
            return cached  # type: ignore[return-value]

        result = self._geocoding_provider.geocode(query)
        self._db_set(query, result)
        return result

    # ------------------------------------------------------------------
    # CEP lookup (used by the API at runtime)
    # ------------------------------------------------------------------

    def lookup_cep(self, cep: str) -> CepLookupResult | None:
        clean_cep = re.sub(r"\D", "", cep or "")
        if len(clean_cep) != 8:
            return None
        return self._cep_provider.lookup(clean_cep)


if __name__ == "__main__":
    import sys

    geocoder = Geocoder()
    if len(sys.argv) > 1:
        argument = sys.argv[1]
        if argument.replace("-", "").isdigit():
            print(geocoder.lookup_cep(argument))
        else:
            print(geocoder.geocode_address(argument, "Sao Paulo", "SP"))
