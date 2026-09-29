"""Live store policy knowledge for support answers.

Reads the public policy/help pages from the storefront (shipping & returns, terms, privacy,
contact, imprint, Shopify policies), keeps a plain-text copy in memory for a few hours, and
returns the passages most relevant to a shopper's question. The support reply is grounded in
these passages, so answers follow whatever the merchant has published on the site.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from html.parser import HTMLParser
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger(__name__)

CACHE_SECONDS = 6 * 60 * 60
FETCH_TIMEOUT_SECONDS = 6
MAX_PAGE_CHARS = 12000

_STOPWORDS = {
    "the", "and", "for", "you", "your", "are", "with", "that", "this", "have", "can", "what", "how", "when",
    "does", "will", "from", "about", "there", "their", "they", "our", "who", "why", "any", "not", "was", "get",
    "ich", "und", "die", "der", "das", "ist", "wie", "was", "wann", "mit", "für", "auf", "ein", "eine", "mein",
}


class _MainContentText(HTMLParser):
    """Collects visible text, preferring the theme's #MainContent region."""

    _SKIP = {"script", "style", "noscript", "svg", "template"}
    _BLOCK = {"p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._main_depth = 0
        self._depth = 0
        self.main_parts: list[str] = []
        self.all_parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        self._depth += 1
        if tag in self._SKIP:
            self._skip_depth += 1
        if self._main_depth == 0 and dict(attrs).get("id") == "MainContent":
            self._main_depth = self._depth
        if tag in self._BLOCK:
            self._newline()

    def handle_endtag(self, tag):
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
        if self._main_depth and self._depth == self._main_depth:
            self._main_depth = 0
        self._depth = max(0, self._depth - 1)
        if tag in self._BLOCK:
            self._newline()

    def handle_data(self, data):
        if self._skip_depth:
            return
        self.all_parts.append(data)
        if self._main_depth:
            self.main_parts.append(data)

    def _newline(self):
        self.all_parts.append("\n")
        if self._main_depth:
            self.main_parts.append("\n")

    def text(self) -> str:
        raw = "".join(self.main_parts) or "".join(self.all_parts)
        lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in raw.splitlines()]
        return "\n".join(line for line in lines if line)


def html_to_text(html: str) -> str:
    parser = _MainContentText()
    parser.feed(html)
    return parser.text()[:MAX_PAGE_CHARS]


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-zäöüß0-9]{3,}", text.lower()) if word not in _STOPWORDS}


class StoreKnowledgeService:
    def __init__(self, base_url: Optional[str] = None, paths: Optional[list[str]] = None) -> None:
        self.base_url = (base_url or settings.storefront_base_url).rstrip("/")
        self.paths = paths or [item.strip() for item in settings.support_policy_pages.split(",") if item.strip()]
        self._pages: dict[str, str] = {}
        self._loaded_at = 0.0
        self._lock = threading.Lock()

    # -- loading ---------------------------------------------------------------
    def _fetch(self, path: str) -> Optional[str]:
        url = f"{self.base_url}{path}"
        request = Request(url, headers={"User-Agent": "StyledGenie-Support/1.0", "Accept": "text/html"})
        try:
            with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
                return response.read().decode("utf-8", errors="replace")
        except (URLError, TimeoutError, OSError) as error:
            logger.warning("Could not fetch policy page %s: %s", url, error)
            return None

    def refresh(self) -> dict[str, str]:
        """Fetch all pages now (runs in a background thread during normal operation)."""
        loaded: dict[str, str] = {}
        for path in self.paths:
            html = self._fetch(path)
            if html:
                text = html_to_text(html)
                if len(text) > 80:
                    loaded[path] = text
        with self._lock:
            if loaded:
                self._pages = loaded
                self._loaded_at = time.time()
            self._refreshing = False
            return dict(self._pages)

    def refresh_in_background(self) -> None:
        with self._lock:
            if getattr(self, "_refreshing", False):
                return
            self._refreshing = True
        threading.Thread(target=self.refresh, name="store-knowledge-refresh", daemon=True).start()

    def pages(self) -> dict[str, str]:
        """Cached pages; never blocks a chat request on network fetches."""
        with self._lock:
            stale = not self._pages or (time.time() - self._loaded_at) >= CACHE_SECONDS
            snapshot = dict(self._pages)
        if stale:
            self.refresh_in_background()
        return snapshot

    # -- retrieval ---------------------------------------------------------------
    def relevant_passages(self, question: str, limit: int = 4, max_chars: int = 3500) -> list[dict]:
        """Paragraphs from the policy pages that share the most words with the question."""
        query = _tokens(question)
        if not query:
            return []
        scored: list[tuple[float, str, str]] = []
        for path, text in self.pages().items():
            lines = [block.strip() for block in re.split(r"\n+", text) if block.strip()]
            # small overlapping windows so a heading ("Express") travels with its details
            windows = [" ".join(lines[i : i + 3]) for i in range(len(lines))]
            windows = [window for window in windows if len(window) > 25]
            for window in windows:
                overlap = query & _tokens(window)
                if overlap:
                    scored.append((len(overlap) / (1 + len(window) / 600), path, window))
        scored.sort(key=lambda item: item[0], reverse=True)
        results: list[dict] = []
        used = 0
        seen: set[str] = set()
        for _, path, window in scored:
            key = window[:120]
            if key in seen:
                continue
            seen.add(key)
            snippet = window[:1200]
            if used + len(snippet) > max_chars:
                break
            results.append({"source": f"{self.base_url}{path}", "text": snippet})
            used += len(snippet)
            if len(results) >= limit:
                break
        return results
