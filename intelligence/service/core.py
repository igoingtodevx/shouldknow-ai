import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

import httpx
import psycopg

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://shouldknow:shouldknow@localhost:5432/shouldknow')
SEARXNG_URL = os.getenv('SEARXNG_URL', '').rstrip('/')
CRAWL4AI_ENDPOINT = os.getenv('CRAWL4AI_ENDPOINT', '').rstrip('/')
AUTO_PUBLISH_P0 = os.getenv('AUTO_PUBLISH_P0', 'false').lower() == 'true'
WATCHSET_PATH = Path(os.getenv('WATCHSET_PATH', Path(__file__).resolve().parents[1] / 'watchset.json'))

P0 = [
    re.compile(r'price|pricing|plan|tier|credit|limit|allowance', re.I),
    re.compile(r'deprecated|deprecation|shutdown|sunset|discontinued|removed|breaking', re.I),
    re.compile(r'privacy|data retention|training data|terms of service|policy', re.I),
    re.compile(r'api version|rate limit|model availability|region availability', re.I),
]
P1 = [
    re.compile(r'integration|workflow|export|import|agent|browser|mobile|desktop', re.I),
    re.compile(r'faster|latency|quality|accuracy|context window|support', re.I),
]
P2 = [re.compile(r'spacing|padding|button|icon|color|copy update|typo|navigation polish', re.I)]


def db():
    return psycopg.connect(DATABASE_URL)


def init_db() -> None:
    schema = (Path(__file__).parent / 'schema.sql').read_text(encoding='utf-8')
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(schema)
        conn.commit()


def normalize(text: str) -> str:
    text = text.replace('\r', '')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def diff_lines(before: str, after: str) -> dict[str, list[str] | bool]:
    left = {line.strip() for line in normalize(before).splitlines() if line.strip()}
    right = {line.strip() for line in normalize(after).splitlines() if line.strip()}
    removed = sorted(left - right)
    added = sorted(right - left)
    return {'removed': removed, 'added': added, 'changed': bool(removed or added)}


def classify(diff: dict[str, Any]) -> tuple[str, str]:
    text = '\n'.join([*diff.get('removed', []), *diff.get('added', [])])
    if not diff.get('changed') or not text.strip():
        return 'P2', 'No meaningful normalized-text change.'
    if any(rule.search(text) for rule in P0):
        return 'P0', 'Matched pricing, breaking, availability or policy-risk rule.'
    if any(rule.search(text) for rule in P2) and not any(rule.search(text) for rule in P1):
        return 'P2', 'Looks cosmetic or editorial.'
    if any(rule.search(text) for rule in P1):
        return 'P1', 'Matched workflow or capability rule.'
    return 'REVIEW', 'Ambiguous diff; semantic classification required.'


def extract_crawl_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        for key in ('markdown', 'text', 'content'):
            if isinstance(payload.get(key), str) and payload[key].strip():
                return payload[key]
        for key in ('results', 'data'):
            value = payload.get(key)
            if isinstance(value, list) and value:
                return extract_crawl_text(value[0])
            if isinstance(value, dict):
                return extract_crawl_text(value)
    raise ValueError('Could not find extracted text in Crawl4AI response')


def crawl(url: str) -> str:
    if not CRAWL4AI_ENDPOINT:
        raise RuntimeError('CRAWL4AI_ENDPOINT is not configured')
    with httpx.Client(timeout=90) as client:
        response = client.post(CRAWL4AI_ENDPOINT, json={'urls': [url]})
        response.raise_for_status()
        return normalize(extract_crawl_text(response.json()))


def search(query: str) -> list[dict[str, Any]]:
    if not SEARXNG_URL:
        raise RuntimeError('SEARXNG_URL is not configured')
    with httpx.Client(timeout=30) as client:
        response = client.get(f'{SEARXNG_URL}/search', params={'q': query, 'format': 'json'})
        response.raise_for_status()
        data = response.json()
        return data.get('results', [])


def load_watchset() -> list[dict[str, Any]]:
    return json.loads(WATCHSET_PATH.read_text(encoding='utf-8'))
