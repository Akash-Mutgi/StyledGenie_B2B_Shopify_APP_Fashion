import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class PublicApiRateLimitMiddleware(BaseHTTPMiddleware):
    """Small per-process sliding-window limits for public, costly AI endpoints."""

    TEXT_PATHS = {"/api/chat", "/api/chat/refine"}
    IMAGE_PATHS = {
        "/api/inspire",
        "/api/complete-look",
        "/api/onboarding/analyze-scan",
        "/api/support-image",
    }
    FEEDBACK_PATHS = {"/api/feedback"}

    def __init__(self, app, clock=time.monotonic):
        super().__init__(app)
        self._clock = clock
        self._requests: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        limit = (
            30 if path in self.TEXT_PATHS
            else 8 if path in self.IMAGE_PATHS
            else 60 if path in self.FEEDBACK_PATHS
            else None
        )
        if limit is None or request.method != "POST":
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = (client_ip, path)
        now = self._clock()
        timestamps = self._requests[key]
        while timestamps and timestamps[0] <= now - 60:
            timestamps.popleft()

        if len(timestamps) >= limit:
            retry_after = max(1, int(60 - (now - timestamps[0])))
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait before trying again."},
                headers={"Retry-After": str(retry_after), "X-RateLimit-Limit": str(limit)},
            )

        timestamps.append(now)
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - len(timestamps)))
        return response
