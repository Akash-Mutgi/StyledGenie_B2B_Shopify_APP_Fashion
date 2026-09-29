"""CORS for app origins plus exact storefront domains registered per merchant."""

import time
from threading import Lock
from urllib.parse import urlsplit, urlunsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings
from app.security.tenant_context import resolve_storefront_origin, use_merchant


_storefront_cache: dict[str, tuple[float, tuple[str, str] | None]] = {}
_storefront_cache_lock = Lock()
_CACHE_SECONDS = 60


def normalize_origin(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw or raw == "*":
        return None
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return None
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        return None
    if port and parsed.hostname not in {"localhost", "127.0.0.1"} and port != 443:
        return None
    host = parsed.hostname.lower().rstrip(".")
    netloc = f"[{host}]" if ":" in host else host
    if port and not (parsed.scheme == "https" and port == 443) and not (parsed.scheme == "http" and port == 80):
        netloc = f"{netloc}:{port}"
    return urlunsplit((parsed.scheme, netloc, "", "", ""))


def _fixed_origins() -> set[str]:
    configured = {origin for value in settings.cors_allowed_origins if (origin := normalize_origin(value))}
    if configured:
        return configured
    own_origins = (
        settings.shopify_app_url,
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    )
    return {origin for value in own_origins if (origin := normalize_origin(value))}


def _merchant_for_origin(origin: str) -> tuple[str, str] | None:
    now = time.monotonic()
    with _storefront_cache_lock:
        cached = _storefront_cache.get(origin)
        if cached and cached[0] > now:
            return cached[1]
    merchant_id = resolve_storefront_origin(origin)
    with _storefront_cache_lock:
        _storefront_cache[origin] = (now + _CACHE_SECONDS, merchant_id)
    return merchant_id


class DynamicStorefrontCORSMiddleware(BaseHTTPMiddleware):
    """Allow app origins and only storefront origins registered to a merchant."""

    async def dispatch(self, request: Request, call_next) -> Response:
        raw_origin = request.headers.get("origin")
        if not raw_origin:
            return await call_next(request)

        origin = normalize_origin(raw_origin)
        if not origin:
            return Response(status_code=400)

        merchant = _merchant_for_origin(origin) if request.url.path.startswith("/api/") else None
        allowed = origin in _fixed_origins() or merchant is not None
        if not allowed:
            return Response(status_code=403)

        if request.method == "OPTIONS" and request.headers.get("access-control-request-method"):
            if not allowed:
                return Response(status_code=403)
            response = Response(status_code=204)
        elif merchant:
            merchant_id_value, shop_domain = merchant
            with use_merchant(merchant_id_value, shop_domain, urlsplit(origin).hostname):
                response = await call_next(request)
        else:
            response = await call_next(request)

        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Accept, Authorization, Content-Type, X-Requested-With"
            vary = {item.strip() for item in response.headers.get("Vary", "").split(",") if item.strip()}
            vary.add("Origin")
            response.headers["Vary"] = ", ".join(sorted(vary))
        return response
