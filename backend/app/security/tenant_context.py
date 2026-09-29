"""Request-scoped merchant identity and Supabase JWT helpers."""

import base64
import contextvars
import hashlib
import hmac
import json
import time
from contextlib import contextmanager
from typing import Iterator, Optional

from app.config import settings


_current_merchant_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_merchant_id", default=None
)
_current_tenant_client: contextvars.ContextVar[object | None] = contextvars.ContextVar(
    "current_tenant_supabase_client", default=None
)
_current_shopify_domain: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_shopify_store_domain", default=None
)
_current_storefront_domain: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_storefront_domain", default=None
)
_admin_client = None


def current_merchant_id() -> Optional[str]:
    return _current_merchant_id.get()


def current_shopify_store_domain() -> Optional[str]:
    return _current_shopify_domain.get()


def current_storefront_domain() -> Optional[str]:
    return _current_storefront_domain.get()


@contextmanager
def use_merchant(
    merchant_id: str,
    shopify_store_domain: Optional[str] = None,
    storefront_domain: Optional[str] = None,
) -> Iterator[None]:
    token = _current_merchant_id.set(merchant_id)
    client_token = _current_tenant_client.set(None)
    shop_token = _current_shopify_domain.set(shopify_store_domain)
    storefront_token = _current_storefront_domain.set(storefront_domain)
    try:
        yield
    finally:
        _current_storefront_domain.reset(storefront_token)
        _current_shopify_domain.reset(shop_token)
        _current_tenant_client.reset(client_token)
        _current_merchant_id.reset(token)


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def create_supabase_tenant_token(merchant_id: str, now: Optional[int] = None) -> str:
    """Mint a short-lived authenticated JWT whose tenant claim is checked by RLS."""
    secret = settings.supabase_jwt_secret
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET is required for tenant-scoped database access.")

    issued_at = int(time.time() if now is None else now)
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = _b64url(
        json.dumps(
            {
                "aud": "authenticated",
                "role": "authenticated",
                "sub": merchant_id,
                "merchant_id": merchant_id,
                "iat": issued_at,
                "exp": issued_at + 300,
            },
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{claims}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header}.{claims}.{_b64url(signature)}"


def create_tenant_supabase_client(merchant_id: str):
    """Create an anon-key client authenticated as this one merchant for RLS."""
    from supabase import create_client

    api_key = settings.supabase_anon_key
    if not settings.supabase_url or not api_key:
        return None
    cached = _current_tenant_client.get()
    if cached is not None:
        return cached
    client = create_client(settings.supabase_url, api_key)
    client.postgrest.auth(create_supabase_tenant_token(merchant_id))
    _current_tenant_client.set(client)
    return client


def create_admin_supabase_client():
    """Service-role access is reserved for tenant lookup/provisioning only."""
    global _admin_client
    from supabase import create_client

    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    if _admin_client is None:
        _admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _admin_client


def resolve_or_create_shopify_merchant(shop_domain: str) -> Optional[str]:
    """Find or provision a tenant from a verified Shopify shop domain."""
    if not shop_domain.endswith(".myshopify.com"):
        return None
    client = create_admin_supabase_client()
    if client is None:
        return None
    try:
        existing = (
            client.table("merchants")
            .select("id")
            .eq("shopify_store_domain", shop_domain)
            .limit(1)
            .execute()
        )
        if existing.data:
            return str(existing.data[0]["id"])
        created = (
            client.table("merchants")
            .insert(
                {
                    "shopify_store_domain": shop_domain,
                    "brand_name": "New Shopify merchant",
                    "storefront_domains": [shop_domain],
                }
            )
            .execute()
        )
        if created.data:
            return str(created.data[0]["id"])
    except Exception:
        return None
    return None


def resolve_storefront_origin(origin: str) -> Optional[tuple[str, str]]:
    """Return a merchant only when the exact origin is registered to its tenant."""
    from urllib.parse import urlsplit

    if not settings.supabase_jwt_secret:
        return None
    try:
        parsed = urlsplit(origin)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"https", "http"} or not host:
        return None
    try:
        client = create_admin_supabase_client()
    except Exception:
        return None
    if client is None:
        return None
    try:
        response = (
            client.table("merchants")
            .select("id,shopify_store_domain")
            .contains("storefront_domains", [host])
            .limit(2)
            .execute()
        )
        if len(response.data or []) == 1:
            return str(response.data[0]["id"]), str(response.data[0]["shopify_store_domain"])
    except Exception:
        return None
    return None
