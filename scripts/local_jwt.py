"""
Gera JWT HS256 para uso local com PostgREST.

Uso:
  python scripts/local_jwt.py anon
  python scripts/local_jwt.py service_role
  python scripts/local_jwt.py anon --secret "outro-segredo"
"""
import argparse
import base64
import hashlib
import hmac
import json


# Precisa bater com PGRST_JWT_SECRET no docker-compose.yml
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
    ap = argparse.ArgumentParser()
    ap.add_argument("role", choices=["anon", "authenticated", "service_role"])
    ap.add_argument("--secret", default=DEFAULT_SECRET)
    args = ap.parse_args()
    print(make_jwt(args.role, args.secret))
