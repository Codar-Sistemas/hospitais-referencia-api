"""
Generate an HS256 JWT for local PostgREST development.

Usage:
  python scripts/local_jwt.py anon
  python scripts/local_jwt.py service_role
  python scripts/local_jwt.py anon --secret "another-secret"
"""

import argparse
import base64
import hashlib
import hmac
import json

# Must match PGRST_JWT_SECRET in docker-compose.yml
DEFAULT_SECRET = "dev-local-jwt-secret-32-chars-minimum-value-ok"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(role: str, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"role": role}
    h = b64url(json.dumps(header, separators=(",", ":")).encode())
    p = b64url(json.dumps(payload, separators=(",", ":")).encode())
    msg = f"{h}.{p}".encode()
    sig = b64url(hmac.new(secret.encode(), msg, hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("role", choices=["anon", "authenticated", "service_role"])
    parser.add_argument("--secret", default=DEFAULT_SECRET)
    args = parser.parse_args()
    print(make_jwt(args.role, args.secret))
