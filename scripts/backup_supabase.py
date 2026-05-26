"""
Backup the production Supabase tables before applying migrations 007+008.

Exports each table as line-delimited JSON (one row per line) plus a manifest
with row counts and a checksum. Output goes to ./backups/<timestamp>/.

Usage:
    export SUPABASE_URL="https://<project>.supabase.co"
    export SUPABASE_SERVICE_KEY="<service_role key from Supabase dashboard>"
    python scripts/backup_supabase.py

Restoration (if ever needed):
    Use Supabase Dashboard → SQL Editor → import the JSON via:
      INSERT INTO <table> SELECT * FROM json_populate_recordset(NULL::<table>, '<paste lines as JSON array>');
    Or write a restore script that reads the .jsonl files and POSTs back.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import requests

# Tables to back up — current PT names since this runs BEFORE migration 007.
# If you've already applied 007 and need backup of EN schema, change to:
#   states, hospitals, cep_cache, geocode_cache, api_metrics
TABLES_PT = ["estados", "hospitais", "cep_cache", "geocode_cache", "api_metrics"]
TABLES_EN = ["states", "hospitals", "cep_cache", "geocoding_cache", "api_metrics"]

PAGE_SIZE = 1000  # PostgREST default cap on rows per request


def detect_schema(url: str, headers: dict) -> list[str]:
    """Probe for the EN table 'states'; if found, assume schema is EN."""
    response = requests.get(
        f"{url}/rest/v1/states", headers=headers, params={"select": "state_code", "limit": "1"}
    )
    return TABLES_EN if response.ok else TABLES_PT


def fetch_table(url: str, headers: dict, table: str) -> list[dict]:
    """Paginate through all rows in a table."""
    rows: list[dict] = []
    offset = 0
    while True:
        page_headers = {
            **headers,
            "Range-Unit": "items",
            "Range": f"{offset}-{offset + PAGE_SIZE - 1}",
        }
        response = requests.get(
            f"{url}/rest/v1/{table}", headers=page_headers, params={"select": "*"}
        )
        if not response.ok:
            raise RuntimeError(f"Failed to fetch {table}: {response.status_code} {response.text}")
        page = response.json()
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def dump_table(rows: list[dict], path: Path) -> dict:
    """Write JSONL and compute SHA-256."""
    sha = hashlib.sha256()
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            line = json.dumps(row, sort_keys=True, ensure_ascii=False)
            f.write(line + "\n")
            sha.update((line + "\n").encode("utf-8"))
    return {
        "rows": len(rows),
        "bytes": path.stat().st_size,
        "sha256": sha.hexdigest(),
    }


def main() -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        print("  export SUPABASE_URL='https://<project>.supabase.co'", file=sys.stderr)
        print(
            "  export SUPABASE_SERVICE_KEY='<service_role from Settings → API>'",
            file=sys.stderr,
        )
        return 2

    url = url.rstrip("/")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%SZ")
    out_dir = Path("backups") / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Backup directory: {out_dir}")

    tables = detect_schema(url, headers)
    print(f"Detected schema: {'EN' if tables == TABLES_EN else 'PT'} ({', '.join(tables)})\n")

    manifest = {
        "timestamp": timestamp,
        "supabase_url": url,
        "schema": "en" if tables == TABLES_EN else "pt",
        "tables": {},
    }

    for table in tables:
        print(f"  → {table} ...", end=" ", flush=True)
        try:
            rows = fetch_table(url, headers, table)
            info = dump_table(rows, out_dir / f"{table}.jsonl")
            manifest["tables"][table] = info
            print(f"{info['rows']} rows ({info['bytes']:,} bytes)")
        except Exception as e:
            manifest["tables"][table] = {"error": str(e)}
            print(f"FAILED: {e}")

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"\nManifest: {out_dir / 'manifest.json'}")
    total_rows = sum(t.get("rows", 0) for t in manifest["tables"].values())
    print(f"Total: {total_rows:,} rows across {len(manifest['tables'])} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
