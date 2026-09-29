from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.security.shopify_auth import verify_shopify_session_token
from app.security.tenant_context import resolve_or_create_shopify_merchant, use_merchant


class ShopifySessionMiddleware(BaseHTTPMiddleware):
    """Require Shopify ID tokens for merchant APIs and catalog import."""

    @staticmethod
    def _is_protected(path: str) -> bool:
        return (
            path.startswith("/api/merchant/")
            or path.startswith("/api/analytics/")
            or path == "/api/catalog/import"
        )

    async def dispatch(self, request: Request, call_next) -> Response:
        if not self._is_protected(request.url.path):
            return await call_next(request)

        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return self._unauthorized()

        try:
            claims = verify_shopify_session_token(token.strip())
        except (ValueError, TypeError, KeyError, UnicodeDecodeError):
            return self._unauthorized()

        if not settings.supabase_jwt_secret:
            return JSONResponse(
                status_code=503,
                content={"detail": "Tenant-scoped database access is not configured."},
            )

        from urllib.parse import urlparse

        shop_domain = (urlparse(str(claims.get("dest") or "")).hostname or "").lower()
        try:
            merchant_id = resolve_or_create_shopify_merchant(shop_domain)
        except Exception:
            merchant_id = None
        if not merchant_id:
            return JSONResponse(
                status_code=503,
                content={"detail": "This Shopify store is not connected to a merchant workspace."},
            )

        request.state.shopify_session = claims
        request.state.merchant_id = merchant_id
        with use_merchant(merchant_id, shop_domain):
            return await call_next(request)

    @staticmethod
    def _unauthorized() -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={"detail": "A valid Shopify session token is required."},
            headers={"WWW-Authenticate": "Bearer"},
        )
