"""
Shared `requests.Session` factory and download helpers.

Centralizes User-Agent and timeout defaults so every outbound HTTP call
in the pipeline is identifiable and consistent. Using a session also
reuses TCP connections, which matters for the geocoding loop.
"""

from __future__ import annotations

import hashlib

import requests

from scripts.shared.config import REQUEST_TIMEOUT, USER_AGENT


def build_session(user_agent: str = USER_AGENT) -> requests.Session:
    session = requests.Session()
    session.headers["User-Agent"] = user_agent
    return session


def download_file(
    url: str,
    session: requests.Session | None = None,
) -> tuple[bytes, str]:
    """Download a file and return (bytes, sha256_hex). The hash feeds the
    change-detection short-circuit in both sync pipelines."""
    response = (session or build_session()).get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.content, hashlib.sha256(response.content).hexdigest()
