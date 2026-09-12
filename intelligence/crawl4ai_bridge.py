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
import ipaddress
import json
import re
import socket
from http.client import HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

MAX_URLS_PER_REQUEST = 10
MAX_REDIRECT_HOPS = 5
FETCH_TIMEOUT_SECONDS = 5


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_NO_REDIRECT_OPENER = build_opener(_NoRedirect)


def _normalized_public_url(raw_url: str) -> str | None:
    try:
        parsed = urlparse(raw_url.strip())
    except ValueError:
        return None
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc or parsed.username or parsed.password:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is not None and port not in {80, 443}:
        return None
    host = (parsed.hostname or '').casefold().rstrip('.')
    if not host or '.' not in host or host.endswith(('.localhost', '.local', '.internal', '.test', '.invalid', '.example')):
        return None
    if re.fullmatch(r'[0-9.]+', host):
        return None
    return urlunparse((parsed.scheme, host, parsed.path or '/', '', parsed.query, ''))


def _address_is_public(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    return not any((
        parsed.is_private, parsed.is_loopback, parsed.is_link_local,
        parsed.is_reserved, parsed.is_multicast, parsed.is_unspecified,
    ))


def _host_resolves_publicly(url: str) -> bool:
    parsed = urlparse(url)
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except (OSError, ValueError):
        return False
    return bool(addresses) and all(_address_is_public(str(item[4][0])) for item in addresses)


def _safe_fetch_url(raw_url: str) -> str | None:
    current = _normalized_public_url(raw_url)
    for _ in range(MAX_REDIRECT_HOPS + 1):
        if not current or not _host_resolves_publicly(current):
            return None
        request = Request(current, method='HEAD', headers={'User-Agent': 'ShouldKnow-Crawl4AI/1.0'})
        location = None
        try:
            with _NO_REDIRECT_OPENER.open(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
                status = int(getattr(response, 'status', 0) or 0)
                location = response.headers.get('Location')
        except HTTPError as exc:
            status = exc.code
            location = exc.headers.get('Location')
            exc.close()
        except (OSError, URLError, HTTPException):
            return current
        if status in {301, 302, 303, 307, 308} and location:
            current = _normalized_public_url(urljoin(current, location))
            continue
        return current
    return None


def _crawl_one(url: str, page_timeout_ms: int) -> dict:
    safe_url = _safe_fetch_url(url)
    if not safe_url:
        return {"url": url, "success": False, "error": "unsafe URL, private DNS target, or redirect", "status_code": None, "markdown": ""}
    url = safe_url
    async def _run(wait_until: str, timeout_ms: int) -> dict:
        run_config = CrawlerRunConfig(
            verbose=False,
            page_timeout=timeout_ms,
            # Wait for lazy-loaded content so repeated crawls of the same page
            # render identically (marketing pages otherwise show different
            # subsets of images/forms on every visit). Playwright spelling:
            # "networkidle". Pages that never go idle (analytics polling, live
            # widgets) time out; the caller retries with domcontentloaded.
            wait_until=wait_until,
            # Drop recognized consent banners (cookiebot/onetrust/...); Ketch and
            # other banners that crawl4ai misses are filtered textually in core.py.
            remove_consent_popups=True,
        )
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

    result = asyncio.run(_run('networkidle', min(page_timeout_ms, 25000)))
    if not result["success"]:
        result = asyncio.run(_run('domcontentloaded', page_timeout_ms))
    return result


def _handle_crawl(urls: list[str], page_timeout_ms: int) -> tuple[int, dict]:
    if not urls:
        return 400, {"success": False, "error": "empty urls list"}
    urls = urls[:MAX_URLS_PER_REQUEST]
    results = []
    for url in urls:
        try:
            results.append(_crawl_one(url, page_timeout_ms))
        except Exception as exc:  # noqa: BLE001 - isolate one URL from the batch
            results.append({"url": url, "success": False, "error": str(exc), "status_code": None, "markdown": ""})
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
