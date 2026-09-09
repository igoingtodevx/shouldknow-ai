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

# --- Crawl-output noise filters -------------------------------------------------
# Marketing pages embed per-request tracking (UUID query params, pixel images) and
# GitHub release pages render reaction churn. Without stripping these, identical
# pages hash differently on every crawl and every run looks like a change. The
# lists below are deliberately generic; they are not per-site hardcodes.
TRACKING_QUERY_PARAMS = {
    # campaign/attribution
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'utm_cid', 'utm_reader', 'utm_brand', 'utm_place', 'utm_userid', 'utm_viz_id',
    'utm_pubreferrer', 'utm_swu', 'utm_referrer', 'utm_social', 'utm_social-type',
    'utm_network', 'utm_account', 'utm_adgroup', 'utm_placement', 'utm_device',
    'mc_cid', 'mc_eid', 'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv',
    'pk_source', 'pk_medium', 'pk_campaign', 'pk_keyword', 'pk_content', 'mtm_source',
    'mtm_medium', 'mtm_campaign', 'mtm_keyword', 'mtm_content', 'matomo_ignore',
    # click/redirect/session ids
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'srsltid', 'wbraid', 'gbraid',
    'igshid', 'irclickid', 'aff_id', 'aff_sub', 'aff_sub2', 'cjevent', 'clickid',
    'subid', 'sub_id', 'scid', 'campaign_id', 'campaignid', 'adgroupid', 'ad_id',
    'banner_id', 'siteid', 'cr_acquisition_id', 'attribution_version', 'yclid',
    'wickedid', 'twclid', 'ttclid', 'li_fat_id', 'hsa_cam', 'hsa_grp', 'hsa_ad',
    'hsa_src', 'hsa_tgt', 'hsa_acc', 'hsa_net', 'hsa_ver', '_hsenc', '_hsmi',
    'hsCtaTracking', 'gad_source', 'gad_campaign', 'gbraid', 'dclid', 'epik',
    's_kwcid', 's_cid', 'oly_enc_id', 'vero_conv', 'vero_id', 'cmpid', 'otm_source',
    'otm_medium', 'otm_campaign', 'otm_term', 'otm_content',
}
TRACKING_QUERY_RE = re.compile(
    r'([?&])(?:' + '|'.join(sorted(TRACKING_QUERY_PARAMS)) + r')=[^&#\s()]*',
    re.I,
)
TRACKING_PIXEL_RE = re.compile(
    r'(?:'
    r'bat\.bing\.net|adroll\.com|t\.co/1/i/adsct|google-analytics\.com|googletagmanager\.com/gtag|'
    r'googleadservices\.com/pagead|facebook\.com/tr|connect\.facebook\.net|doubleclick\.net|'
    r'scorecardresearch\.com|hotjar\.com|static\.hotjar\.com|clarity\.ms|c\.clarity\.ms|'
    r'mixpanel\.com|segment\.io/analytics|fullstory\.com|amplitude\.com|snap\.licdn\.com|'
    r'ads\.linkedin\.com|px\.ads\.linkedin\.com|redditstatic\.com/ads|criteo\.net|taboola\.com|'
    r'outbrain\.com|quantserve\.com|chartbeat\.com|newrelic\.com|nr-data\.net|browser-intake-|'
    # A/B testing platforms rotate page content per request; without stripping
    # their assets the same page hashes differently on every visit.
    # (bare "spiralyze" also matches its res.cloudinary.com/spiralyze/... path)
    r'spiralyze|vwo\.com|vwo\.net|optimizely\.com|cdn\.optimizely\.com|'
    r'googleoptimize\.com|kameleoon\.com|dynamicyield\.com|abtasty\.com|'
    r'inspectlet\.com|everestjs\.net'
    r')',
    re.I,
)
# Lines that are only a reaction counter/summary on GitHub pages: a reaction image
# or emoji prefix, an optional count, usernames ("alice and bob"), and either
# "reacted with <x> emoji" or "N reactions". Deliberately linear (single .* per
# branch): nested quantifiers here caused catastrophic backtracking on long
# URL-only lines, hanging the worker for minutes on every GitHub page.
GITHUB_REACTION_RE = re.compile(
    r'^[\s>*\-+]*!?\[[^\]]*\]\([^)]*\)\s*(?:\d+\s+)?.*reacted with .*emoji\s*$'
    r'|^[\s>*\-+]*!?\[[^\]]*\]\([^)]*\)\s*(?:\d+\s*)?reactions?\s*$'
    r'|^[\s>*\-+]*(?:👍|👎|🎉|😄|❤️|🚀|👀)\s*(?:\d+\s+)?.*reacted with .*emoji\s*$'
    r'|^[\s>*\-+]*(?:👍|👎|🎉|😄|❤️|🚀|👀)\s*(?:\d+\s*)?reactions?\s*$',
    re.I,
)
# Lines that are nothing but a tracking pixel image: ![alt](https://tracking.domain/...)
# (inline removal in _strip_tracking_images covers this and mixed lines)

def db():
    return psycopg.connect(DATABASE_URL)


def init_db() -> None:
    schema = (Path(__file__).parent / 'schema.sql').read_text(encoding='utf-8')
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(schema)
        conn.commit()


def _strip_tracking_params(text: str) -> str:
    """Remove per-request tracking query params from any URL in the text."""
    def _clean_url(match: re.Match) -> str:
        url = match.group(0)
        stripped = TRACKING_QUERY_RE.sub('', url)
        # remove dangling '?'/'&' left behind by the strip
        stripped = re.sub(r'[?&]+([#\s)])', r'\1', stripped)
        stripped = re.sub(r'\?&', '?', stripped)
        stripped = re.sub(r'&{2,}', '&', stripped)
        stripped = stripped.rstrip('?&')
        return stripped
    return re.sub(r'https?://[^\s<>"\')\]]+', _clean_url, text)


def _strip_tracking_images(line: str) -> str:
    """Remove image tokens whose URL points at a tracking/A-B domain.

    Works inline (a line may contain a tracking pixel next to real content) and
    as a whole-line matcher. Kept linear: single character-class quantifiers.
    """
    def _repl(match: re.Match) -> str:
        url = match.group(1)
        if TRACKING_PIXEL_RE.search(url):
            return ''
        return match.group(0)
    return re.sub(r'!\[[^\]]*\]\((https?://[^)\s]+)\)', _repl, line)


def normalize(text: str) -> str:
    text = text.replace('\r', '')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    cleaned: list[str] = []
    for line in text.splitlines():
        line = _strip_tracking_params(line.strip())
        line = _strip_tracking_images(line).strip()
        line = re.sub(r'[ \t]{2,}', ' ', line)  # collapse gaps left by removed tokens
        if not line:
            continue
        if GITHUB_REACTION_RE.match(line):
            continue
        cleaned.append(line)
    return '\n'.join(cleaned).strip()


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
