#!/usr/bin/env python3
"""Async HTTP bridge to the VPS Crawl4AI install (crawl4ai 0.8.9, library + Playwright).

Features:
- Persistent AsyncWebCrawler instance: browser is launched ONCE on startup and
  reused across all crawl requests, eliminating heavy launch overhead and
  preventing zombie process leaks.
- Concurrency bounded via asyncio.Semaphore (max 2 parallel pages).
- Full SSRF validation preserved.
- Native aiohttp async server on a single event loop.
- Graceful shutdown with browser cleanup.

Contract (legacy /crawl style, compatible with intelligence/service/core.py):
  GET  /health            -> {"status": "ok", "engine": "crawl4ai", "version": "bridge-0.2"}
  POST /crawl             -> body: {"urls": ["https://...", ...]}
     200 -> {"success": true, "results": [{"url", "markdown", "status_code", "success"}...]}
     502 -> {"success": false, "error": "...", "results": [...]}
     400 -> {"success": false, "error": "..."}
"""

import argparse
import asyncio
import ipaddress
import json
import logging
import re
import socket
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from aiohttp import web
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

logger = logging.getLogger("crawl4ai_bridge")

MAX_URLS_PER_REQUEST = 10
MAX_REDIRECT_HOPS = 5
FETCH_TIMEOUT_SECONDS = 5
CONCURRENT_CRAWL_LIMIT = 2


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


async def _crawl_single_url(crawler: AsyncWebCrawler, url: str, page_timeout_ms: int) -> dict:
    safe_url = _safe_fetch_url(url)
    if not safe_url:
        return {
            "url": url,
            "success": False,
            "error": "unsafe URL, private DNS target, or redirect",
            "status_code": None,
            "markdown": "",
        }

    async def _try_fetch(wait_until: str, timeout_ms: int):
        run_config = CrawlerRunConfig(
            verbose=False,
            page_timeout=timeout_ms,
            wait_until=wait_until,
            remove_consent_popups=True,
        )
        result = await crawler.arun(url=safe_url, config=run_config)
        if result is None:
            return {
                "url": url,
                "success": False,
                "error": "no result object",
                "status_code": None,
                "markdown": "",
            }
        return {
            "url": url,
            "success": bool(getattr(result, "success", False)),
            "error": getattr(result, "error_message", None) or None,
            "status_code": getattr(result, "status_code", None),
            "markdown": getattr(result, "markdown", "") or "",
        }

    try:
        res = await _try_fetch('networkidle', min(page_timeout_ms, 25000))
        if not res["success"]:
            res = await _try_fetch('domcontentloaded', page_timeout_ms)
        return res
    except Exception as exc:
        logger.warning(f"Error crawling {url}: {exc}")
        return {
            "url": url,
            "success": False,
            "error": str(exc),
            "status_code": None,
            "markdown": "",
        }


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "status": "ok",
        "engine": "crawl4ai",
        "version": "bridge-0.2",
    })


async def handle_crawl(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception as exc:
        return web.json_response({"success": False, "error": f"bad request: {exc}"}, status=400)

    urls = body.get("urls")
    if not isinstance(urls, list):
        return web.json_response({"success": False, "error": "expected {\"urls\": [...]}"}, status=400)

    urls = [u for u in urls if isinstance(u, str) and u.strip()][:MAX_URLS_PER_REQUEST]
    if not urls:
        return web.json_response({"success": False, "error": "empty urls list"}, status=400)

    crawler: AsyncWebCrawler = request.app["crawler"]
    semaphore: asyncio.Semaphore = request.app["semaphore"]
    page_timeout_ms: int = request.app["page_timeout_ms"]

    results = []
    for u in urls:
        async with semaphore:
            res = await _crawl_single_url(crawler, u, page_timeout_ms)
            results.append(res)

    ok = [r for r in results if r["success"]]
    if not ok:
        return web.json_response({"success": False, "error": "all requested URLs failed", "results": results}, status=502)

    return web.json_response({"success": True, "results": results}, status=200)


async def crawler_lifespan(app: web.Application):
    logger.info("Initializing persistent AsyncWebCrawler...")
    crawler = AsyncWebCrawler(verbose=False)
    await crawler.start()
    app["crawler"] = crawler
    app["semaphore"] = asyncio.Semaphore(CONCURRENT_CRAWL_LIMIT)
    logger.info("AsyncWebCrawler ready to serve requests.")
    try:
        yield
    finally:
        logger.info("Closing AsyncWebCrawler...")
        try:
            await crawler.close()
        except Exception as exc:
            logger.warning(f"Error during crawler shutdown: {exc}")
        logger.info("AsyncWebCrawler closed cleanly.")


def create_app(page_timeout_ms: int = 60000) -> web.Application:
    app = web.Application()
    app["page_timeout_ms"] = page_timeout_ms
    app.cleanup_ctx.append(crawler_lifespan)
    app.router.add_get("/health", handle_health)
    app.router.add_post("/crawl", handle_crawl)
    return app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[bridge] %(asctime)s %(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(description="Crawl4AI HTTP bridge for Should Know")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11235)
    parser.add_argument("--page-timeout-ms", type=int, default=60000)
    args = parser.parse_args()

    app = create_app(page_timeout_ms=args.page_timeout_ms)
    logger.info(f"Starting crawl4ai bridge on http://{args.host}:{args.port}")
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
