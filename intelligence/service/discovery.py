import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from enrichment import canonical_url

DISCOVERY_SOURCES_PATH = Path(__file__).resolve().parents[1] / 'discovery_sources.json'
MARKDOWN_LINK_RE = re.compile(r'\[([^\]]+)\]\((https?://[^)\s]+|/[^)\s]+)\)')
GENERIC_LABELS = {
    'about', 'advertise', 'all ai tools', 'all categories', 'blog', 'categories',
    'contact', 'discord', 'featured', 'free tools', 'home', 'jobs', 'learn more',
    'login', 'more', 'new ais', 'newsletter', 'pricing', 'privacy', 'products',
    'read more', 'resources', 'search', 'sign in', 'sign up', 'submit', 'tools',
    'top ai tools', 'try now', 'update ai', 'view all', 'visit', 'visit site',
}


def load_discovery_sources() -> list[dict[str, Any]]:
    return json.loads(DISCOVERY_SOURCES_PATH.read_text(encoding='utf-8'))


def _clean_title(raw: str) -> str | None:
    title = re.sub(r'^Image:\s*', '', raw.strip(), flags=re.I)
    title = re.sub(r'[*_`]+', '', title)
    title = re.sub(r'\s+', ' ', title).strip(' -–—|')
    lowered = title.casefold()
    if not title or lowered in GENERIC_LABELS:
        return None
    if len(title) < 2 or len(title) > 90:
        return None
    if len(title.split()) > 12:
        return None
    if re.fullmatch(r'[\d\W_]+', title):
        return None
    return title


def _canonical_url(raw_url: str, source_url: str) -> str | None:
    absolute = urljoin(source_url, raw_url)
    safe_url = canonical_url(absolute)
    if not safe_url:
        return None
    source_host = (urlparse(source_url).hostname or '').casefold().removeprefix('www.')
    candidate_host = (urlparse(safe_url).hostname or '').casefold().removeprefix('www.')
    if source_host and candidate_host != source_host:
        return None
    return safe_url


def extract_directory_candidates(markdown: str, source: dict[str, Any]) -> list[dict[str, Any]]:
    prefixes = tuple(source.get('candidatePathPrefixes') or [])
    max_candidates = int(source.get('maxCandidates') or 40)
    weight = float(source.get('weight') or 1.0)
    candidates: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for raw_title, raw_url in MARKDOWN_LINK_RE.findall(markdown):
        title = _clean_title(raw_title)
        url = _canonical_url(raw_url, source['url'])
        if not title or not url:
            continue
        path = urlparse(url).path
        if prefixes and not any(path.startswith(prefix) for prefix in prefixes):
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        rank = len(candidates)
        candidates.append({
            'title': title,
            'url': url,
            'sourceId': source['id'],
            'sourceName': source['name'],
            'sourceUrl': source['url'],
            'score': round(weight + max(0.0, 1.0 - (rank / max(max_candidates, 1))), 4),
        })
        if len(candidates) >= max_candidates:
            break

    return candidates
