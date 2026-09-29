import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlparse

from app.config import settings


def _decode_segment(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def _host(value: object) -> str:
    raw = str(value or "")
    parsed = urlparse(raw if "://" in raw else f"//{raw}")
    return (parsed.hostname or "").lower().rstrip(".")


def verify_shopify_session_token(token: str, now: float | None = None) -> dict:
    """Verify a Shopify App Bridge ID/session token for the configured store."""
    if not settings.shopify_client_secret or not settings.shopify_client_id:
        raise ValueError("Shopify session-token verification is not configured.")

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT.")

    header = json.loads(_decode_segment(parts[0]))
    claims = json.loads(_decode_segment(parts[1]))
    if not isinstance(header, dict) or header.get("alg") != "HS256":
        raise ValueError("Unsupported JWT algorithm.")

    signed = f"{parts[0]}.{parts[1]}".encode("ascii")
    expected = hmac.new(settings.shopify_client_secret.encode(), signed, hashlib.sha256).digest()
    supplied = _decode_segment(parts[2])
    if not hmac.compare_digest(expected, supplied):
        raise ValueError("Invalid JWT signature.")

    current_time = time.time() if now is None else now
    if not isinstance(claims, dict):
        raise ValueError("Invalid JWT claims.")
    if float(claims.get("exp", 0)) <= current_time:
        raise ValueError("Expired JWT.")
    if float(claims.get("nbf", 0)) > current_time:
        raise ValueError("JWT is not active yet.")
    if claims.get("aud") != settings.shopify_client_id:
        raise ValueError("JWT audience mismatch.")

    issuer = urlparse(str(claims.get("iss") or ""))
    destination = urlparse(str(claims.get("dest") or ""))
    issuer_shop = _host(claims.get("iss"))
    destination_shop = _host(claims.get("dest"))
    if (
        issuer.scheme != "https"
        or issuer.path.rstrip("/") != "/admin"
        or destination.scheme != "https"
        or issuer_shop != destination_shop
        or not destination_shop.endswith(".myshopify.com")
    ):
        raise ValueError("JWT must identify the same Shopify myshopify.com shop in iss and dest.")
    if not claims.get("sub"):
        raise ValueError("JWT subject is missing.")
    return claims
