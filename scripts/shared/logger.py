"""
Tiny structured logger.

Wraps `print(..., flush=True)` so log lines appear immediately in
GitHub Actions output. Centralizing here keeps log formatting consistent
across modules and gives us a single seam if we later swap for the
stdlib `logging` module.
"""

from __future__ import annotations

import sys
from typing import Any


def log(message: str, *, state_code: str | None = None) -> None:
    prefix = f"[{state_code}] " if state_code else ""
    print(f"{prefix}{message}", flush=True)


def warn(message: str, *, state_code: str | None = None) -> None:
    prefix = f"[{state_code}] " if state_code else ""
    print(f"{prefix}WARN: {message}", file=sys.stderr, flush=True)


def error(message: str, *, state_code: str | None = None) -> None:
    prefix = f"[{state_code}] " if state_code else ""
    print(f"{prefix}ERROR: {message}", file=sys.stderr, flush=True)


def info(message: Any, *, state_code: str | None = None) -> None:
    log(str(message), state_code=state_code)
