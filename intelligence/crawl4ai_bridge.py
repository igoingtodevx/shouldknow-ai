#!/usr/bin/env python3
"""Thin HTTP bridge to the VPS Crawl4AI install (crawl4ai 0.8.9, library + Playwright).

Why this exists:
  The Should Know worker talks to Crawl4AI through a plain HTTP contract
  (POST {"urls": [...]} -> extracted markdown per URL). The Crawl4AI install on
  the VPS is the library/MCP distribution (no bundled REST server), so this
  bridge exposes exactly that contract over the same installed engine. It is a
  generic adapter, not a mock: every response is produced by a real
  AsyncWebCrawler run against the requested URL.

Contract (legacy /crawl style, compatible with intelligence/service/core.py):
  GET  /health            -> {"status": "ok", ...}
  POST /crawl             -> body: {"urls": ["https://...", ...]}
     200 -> {"success": true, "results": [{"url", "markdown", "status_code", "success"}...]}
     502 -> {"success": false, "error": "..."}  (every requested URL failed)

Run (host, crawl4ai venv):
  /home/deploy/.local/share/crawl4ai/venv/bin/python intelligence/crawl4ai_bridge.py \
      --host 127.0.0.1 --port 11235
"""

import argparse
import asyncio
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

MAX_URLS_PER_REQUEST = 10


def _crawl_one(url: str, page_timeout_ms: int) -> dict:
    run_config = CrawlerRunConfig(
        verbose=False,
        page_timeout=page_timeout_ms,
        # Wait for lazy-loaded content and drop consent banners so repeated
        # crawls of the same page hash identically (marketing pages otherwise
        # render different subsets of images/forms on every visit).
        wait_until='network_idle',
        remove_consent_popups=True,
    )
    async def _run() -> dict:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url, config=run_config)
            if result is None:
                return {"url": url, "success": False, "error": "no result object", "status_code": None, "markdown": ""}
            return {
                "url": url,
                "success": bool(getattr(result, "success", False)),
                "error": getattr(result, "error_message", None) or None,
                "status_code": getattr(result, "status_code", None),
                "markdown": getattr(result, "markdown", "") or "",
            }
    return asyncio.run(_run())


def _handle_crawl(urls: list[str], page_timeout_ms: int) -> tuple[int, dict]:
    if not urls:
        return 400, {"success": False, "error": "empty urls list"}
    urls = urls[:MAX_URLS_PER_REQUEST]
    results = [_crawl_one(url, page_timeout_ms) for url in urls]
    ok = [r for r in results if r["success"]]
    if not ok:
        return 502, {"success": False, "error": "all requested URLs failed", "results": results}
    return 200, {"success": True, "results": results}


class Handler(BaseHTTPRequestHandler):
    server_version = "Crawl4AIBridge/0.1"

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._send(200, {"status": "ok", "engine": "crawl4ai", "version": "bridge-0.1"})
        else:
            self._send(404, {"success": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/crawl":
            self._send(404, {"success": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                raise ValueError("missing body")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            urls = body.get("urls")
            if not isinstance(urls, list):
                raise ValueError("expected {\"urls\": [...]}")
            urls = [u for u in urls if isinstance(u, str) and u.strip()]
        except Exception as exc:  # noqa: BLE001 - malformed input must not kill the server
            self._send(400, {"success": False, "error": f"bad request: {exc}"})
            return
        code, payload = _handle_crawl(urls, self.server.page_timeout_ms)  # type: ignore[attr-defined]
        self._send(code, payload)

    def log_message(self, format: str, *args) -> None:  # keep stdout clean
        print(f"[bridge] {self.address_string()} {format % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl4AI HTTP bridge for Should Know")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11235)
    parser.add_argument("--page-timeout-ms", type=int, default=60000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.page_timeout_ms = args.page_timeout_ms  # type: ignore[attr-defined]
    print(f"[bridge] crawl4ai bridge listening on http://{args.host}:{args.port} (POST /crawl)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[bridge] shutting down", flush=True)


if __name__ == "__main__":
    main()
