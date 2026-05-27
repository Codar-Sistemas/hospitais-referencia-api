"""
Lightweight Supabase REST client used by all sync/geocoding modules.

We intentionally avoid the official `supabase` Python SDK — it pulls in
heavy async transitive dependencies that are unnecessary for our simple
REST usage and slow down cold starts in GitHub Actions.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import requests

from scripts.shared.config import REQUEST_TIMEOUT


class SupabaseClient:
    """Thin wrapper over PostgREST endpoints exposed by Supabase."""

    def __init__(
        self,
        url: str,
        key: str,
        session: requests.Session | None = None,
        rest_base: str | None = None,
    ):
        self.url = url.rstrip("/")
        # Managed Supabase exposes REST at <url>/rest/v1; local PostgREST serves
        # at <url>/. Caller can override with rest_base for local dev.
        self.rest_base = (rest_base or f"{self.url}/rest/v1").rstrip("/")
        self.key = key
        self._session = session or requests.Session()
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------
    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = self._session.request(
            method,
            f"{self.rest_base}/{path}",
            headers=self.headers,
            timeout=REQUEST_TIMEOUT,
            **kwargs,
        )
        if not response.ok:
            raise RuntimeError(
                f"Supabase {method} {path} failed: {response.status_code} {response.text}"
            )
        return response.json() if response.text else None

    def select(self, table: str, **params: str) -> list[dict[str, Any]]:
        return self._request("GET", table, params=params) or []

    def upsert(self, table: str, rows: Iterable[dict[str, Any]], on_conflict: str) -> None:
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        response = self._session.post(
            f"{self.rest_base}/{table}",
            headers=headers,
            params={"on_conflict": on_conflict},
            json=list(rows),
            timeout=REQUEST_TIMEOUT,
        )
        if not response.ok:
            raise RuntimeError(f"Upsert {table} failed: {response.status_code} {response.text}")

    def delete(self, table: str, **params: str) -> None:
        headers = {**self.headers, "Prefer": "return=minimal"}
        response = self._session.delete(
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        if not response.ok:
            raise RuntimeError(f"Delete {table} failed: {response.status_code} {response.text}")

    def update(self, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
        headers = {**self.headers, "Prefer": "return=minimal"}
        params = {k: f"eq.{v}" for k, v in match.items()}
        response = self._session.patch(
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            json=values,
            timeout=REQUEST_TIMEOUT,
        )
        if not response.ok:
            raise RuntimeError(f"Update {table} failed: {response.status_code} {response.text}")
