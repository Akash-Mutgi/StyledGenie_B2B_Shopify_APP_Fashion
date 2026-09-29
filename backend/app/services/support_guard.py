"""Request-level safety for the public storefront chat.

- Every storefront visitor gets their own session id (``sgv_<uuid4>``). Anything else,
  including the old shared ``shopify-storefront-guest`` id, is replaced by a fresh
  one-off id so no two shoppers can ever share chat history or order details.
- Simple in-memory sliding-window rate limits protect order lookups, handoffs and the
  chat endpoint itself from probing and spam. (Per instance; good enough for a single
  small backend. Move to Redis if you run several instances.)
- Merchant endpoints use Shopify session-token authentication in middleware.
"""

from __future__ import annotations

import re
import threading
import time
import uuid
from collections import defaultdict, deque
from contextvars import ContextVar
from typing import Optional

from fastapi import HTTPException, Request

VISITOR_ID_RE = re.compile(r"^sgv_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")

current_client_ip: ContextVar[str] = ContextVar("current_client_ip", default="unknown")
current_visitor_id: ContextVar[str] = ContextVar("current_visitor_id", default="")


def new_visitor_id() -> str:
    return f"sgv_{uuid.uuid4()}"


def normalize_visitor_id(customer_id: Optional[str]) -> str:
    """Return the caller's visitor id if well-formed, otherwise a fresh single-use id."""
    value = (customer_id or "").strip().lower()
    if VISITOR_ID_RE.match(value):
        return value
    return new_visitor_id()


def client_ip_from_request(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    return (request.client.host if request.client else None) or "unknown"


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, window_seconds: float, now: float) -> deque[float]:
        bucket = self._hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        return bucket

    def is_blocked(self, key: str, limit: int, window_seconds: float) -> bool:
        with self._lock:
            return len(self._prune(key, window_seconds, time.monotonic())) >= limit

    def hit(self, key: str, limit: int, window_seconds: float) -> bool:
        """Record a hit. Returns True if the hit is allowed, False if over the limit."""
        with self._lock:
            now = time.monotonic()
            bucket = self._prune(key, window_seconds, now)
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()

# Limits (count, window seconds)
CHAT_PER_IP = (40, 60)
CHAT_PER_VISITOR = (20, 60)
ORDER_FAILS_PER_VISITOR = (5, 30 * 60)
ORDER_FAILS_PER_IP = (15, 60 * 60)
HANDOFFS_PER_VISITOR = (3, 60 * 60)
HANDOFFS_PER_IP = (10, 60 * 60)


def enforce_chat_rate_limit(visitor_id: str, client_ip: str) -> None:
    if not limiter.hit(f"chat:ip:{client_ip}", *CHAT_PER_IP) or not limiter.hit(
        f"chat:visitor:{visitor_id}", *CHAT_PER_VISITOR
    ):
        raise HTTPException(status_code=429, detail="Too many messages. Please wait a moment and try again.")


def order_lookup_locked(visitor_id: str, client_ip: str) -> bool:
    return limiter.is_blocked(f"orderfail:visitor:{visitor_id}", *ORDER_FAILS_PER_VISITOR) or limiter.is_blocked(
        f"orderfail:ip:{client_ip}", *ORDER_FAILS_PER_IP
    )


def record_failed_order_lookup(visitor_id: str, client_ip: str) -> None:
    limiter.hit(f"orderfail:visitor:{visitor_id}", *ORDER_FAILS_PER_VISITOR)
    limiter.hit(f"orderfail:ip:{client_ip}", *ORDER_FAILS_PER_IP)


def allow_handoff(visitor_id: str, client_ip: str) -> bool:
    return limiter.hit(f"handoff:visitor:{visitor_id}", *HANDOFFS_PER_VISITOR) and limiter.hit(
        f"handoff:ip:{client_ip}", *HANDOFFS_PER_IP
    )


