"""
Shared `requests.Session` factory.

Centralizes User-Agent and timeout defaults so every outbound HTTP call
in the pipeline is identifiable and consistent. Using a session also
reuses TCP connections, which matters for the geocoding loop.
"""

from __future__ import annotations

import requests

from scripts.shared.config import USER_AGENT


def build_session(user_agent: str = USER_AGENT) -> requests.Session:
    session = requests.Session()
    session.headers["User-Agent"] = user_agent
    return session
