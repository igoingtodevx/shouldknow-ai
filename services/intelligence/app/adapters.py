from __future__ import annotations

import os
from typing import Any

import httpx

from .core import safe_public_url

class SearXNGClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or os.environ.get("SEARXNG_URL", "")).rstrip("/")
        if not self.base_url:
            raise RuntimeError("SEARXNG_URL is not configured")

    def search(self, query: str, time_range: str = "month", limit: int = 20) -> list[dict[str, Any]]:
        response = httpx.get(
            f"{self.base_url}/search",
            params={"q": query, "format": "json", "time_range": time_range, "language": "en"},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results", []) if isinstance(payload, dict) else []
        cleaned: list[dict[str, Any]] = []
        for result in results[:limit]:
            url = str(result.get("url", ""))
            if not safe_public_url(url):
                continue
            cleaned.append({"title": result.get("title", ""), "url": url, "content": result.get("content", "")})
        return cleaned


class Crawl4AIClient:
    def __init__(self, base_url: str | None = None, token: str | None = None) -> None:
        self.base_url = (base_url or os.environ.get("CRAWL4AI_URL", "")).rstrip("/")
        self.token = token or os.environ.get("CRAWL4AI_API_TOKEN")
        if not self.base_url:
            raise RuntimeError("CRAWL4AI_URL is not configured")

    def crawl_markdown(self, url: str) -> tuple[str, dict[str, Any]]:
        if not safe_public_url(url):
            raise ValueError(f"Refusing non-public URL: {url}")
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        payload = {
            "urls": [url],
            "browser_config": {"type": "BrowserConfig", "params": {"headless": True}},
            "crawler_config": {"type": "CrawlerRunConfig", "params": {"stream": False, "cache_mode": "bypass"}},
        }
        response = httpx.post(f"{self.base_url}/crawl", json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        data = response.json()
        markdown = self._extract_markdown(data)
        if not markdown:
            raise RuntimeError(f"Crawl4AI returned no markdown for {url}")
        return markdown, {"crawler": "crawl4ai", "status_code": response.status_code}

    @staticmethod
    def _extract_markdown(payload: Any) -> str:
        candidates: list[Any] = []
        if isinstance(payload, dict):
            candidates.extend([payload.get("results"), payload.get("data"), payload.get("result")])
        elif isinstance(payload, list):
            candidates.append(payload)
        for candidate in candidates:
            items = candidate if isinstance(candidate, list) else [candidate]
            for item in items:
                if not isinstance(item, dict):
                    continue
                markdown = item.get("markdown")
                if isinstance(markdown, str):
                    return markdown
                if isinstance(markdown, dict):
                    for key in ("fit_markdown", "raw_markdown", "markdown_with_citations"):
                        value = markdown.get(key)
                        if isinstance(value, str) and value.strip():
                            return value
        return ""
