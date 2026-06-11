"""
Shared `requests.Session` factory and download helpers.

Centralizes User-Agent and timeout defaults so every outbound HTTP call
in the pipeline is identifiable and consistent. Using a session also
reuses TCP connections, which matters for the geocoding loop.
"""

from __future__ import annotations

import hashlib

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from scripts.shared.config import REQUEST_TIMEOUT, USER_AGENT


def build_session(user_agent: str = USER_AGENT, retries: int = 3) -> requests.Session:
    """A session that retries transient failures with exponential backoff.

    gov.br intermittently drops connections from CI runners (e.g. `[Errno 101]
    Network is unreachable`), so a single blip used to fail the whole sync.
    `connect`/`read` retries cover those network errors; the status list covers
    transient 5xx. 429 is deliberately excluded — rate limiting is handled by
    the callers' own pacing, not silently retried here. Backoff: 0s, 1.5s, 3s.
    """
    session = requests.Session()
    session.headers["User-Agent"] = user_agent
    if retries > 0:
        retry = Retry(
            total=retries,
            connect=retries,
            read=retries,
            backoff_factor=1.5,
            status_forcelist=(500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "HEAD"}),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
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
