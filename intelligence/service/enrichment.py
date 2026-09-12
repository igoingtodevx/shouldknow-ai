from __future__ import annotations

import hashlib
import ipaddress
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlparse, urlunparse


SOURCE_KINDS = ('homepage', 'pricing', 'changelog', 'docs', 'github')

GENERIC_TOKENS = {
    'ai', 'app', 'apps', 'assistant', 'best', 'code', 'directory', 'free', 'google',
    'new', 'online', 'platform', 'sensor', 'software', 'the', 'tool', 'tools',
    'website', 'with', 'your',
}
AGGREGATOR_HOSTS = {
    'challengingvoice.com', 'futurepedia.io', 'g2.com', 'producthunt.com',
    'toolify.ai', 'wikipedia.org', 'youtube.com', 'reddit.com', 'medium.com',
    'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'techcrunch.com',
}
OFFICIAL_HOST_ALIASES = {
    'chatgpt.com': {'openai.com'},
    'claude.com': {'anthropic.com'},
    'google.com': {'google.com', 'google.dev'},
    'grok.com': {'x.ai'},
    'midjourney.com': set(),
    'blackbox.ai': set(),
    'perplexity.ai': set(),
    'hubspot.com': set(),
}
OFFICIAL_GITHUB_OWNERS = {
    'chatgpt.com': {'openai'},
    'claude.com': {'anthropics'},
    'google.com': {'google-gemini'},
    'grok.com': {'xai'},
    'midjourney.com': {'midjourney-official'},
}
KNOWN_OFFICIAL_REGISTRABLE_HOSTS = set(OFFICIAL_HOST_ALIASES) | {
    alias for aliases in OFFICIAL_HOST_ALIASES.values() for alias in aliases
}
GITHUB_REPOSITORY_STOPWORDS = {
    'alternative', 'alternatives', 'awesome', 'community', 'examples', 'list',
    'mirror', 'unofficial', 'userscript',
}
PATH_HINTS = {
    'pricing': ('pricing', 'plans', 'plan', 'billing', 'subscription'),
    'changelog': ('changelog', 'release-notes', 'releases', 'whats-new', 'updates', 'news'),
    'docs': ('docs', 'documentation', 'developers', 'developer', 'api', 'reference', 'help'),
}

DATE_RE = re.compile(
    r'\b(?:'
    r'20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?|'
    r'(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|'
    r'jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|'
    r'nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+20\d{2}|'
    r'\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|'
    r'august|september|october|november|december)\s+20\d{2}'
    r')\b',
    re.I,
)
DATE_FORMATS = (
    '%Y-%m-%d', '%Y/%m/%d', '%Y.%m.%d',
    '%B %d, %Y', '%B %d %Y', '%b %d, %Y', '%b %d %Y',
    '%d %B %Y', '%d %b %Y',
)


@dataclass(frozen=True)
class SourceMatch:
    kind: str
    url: str
    title: str
    confidence: float
    reason: str


@dataclass(frozen=True)
class RecentEntry:
    title: str
    body: str
    published_at: datetime


SearchFn = Callable[[str], list[dict[str, Any]]]


def canonical_url(raw_url: str) -> str | None:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        return None
    if parsed.username or parsed.password:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is not None and port not in {80, 443}:
        return None
    host = (parsed.hostname or '').casefold().rstrip('.')
    if not host or host in {'localhost', 'localhost.localdomain'} or host.endswith(('.localhost', '.local', '.internal', '.test', '.invalid', '.example')):
        return None
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address and (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast or address.is_unspecified):
        return None
    return urlunparse((parsed.scheme, host, parsed.path.rstrip('/') or '/', '', '', ''))


def _registrable_host(host: str) -> str:
    labels = [label for label in host.casefold().split('.') if label]
    return '.'.join(labels[-2:]) if len(labels) >= 2 else host.casefold()


def _host(raw_url: str) -> str:
    return (urlparse(raw_url).hostname or '').casefold().removeprefix('www.')


def _tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().casefold()
    return {
        token for token in re.findall(r'[a-z0-9]{3,}', normalized)
        if token not in GENERIC_TOKENS
    }


def _candidate_tokens(title: str, seed_url: str) -> set[str]:
    return _tokens(title) | _tokens(urlparse(seed_url).path)


def _is_aggregator(host: str) -> bool:
    return any(host == domain or host.endswith('.' + domain) for domain in AGGREGATOR_HOSTS)


def _related_to_candidate(title: str, url: str, candidate_tokens: set[str]) -> bool:
    host_tokens = _tokens(_host(url).replace('.', ' '))
    path_tokens = _tokens(urlparse(url).path.replace('/', ' '))
    result_tokens = _tokens(title)
    return bool(candidate_tokens & (host_tokens | path_tokens | result_tokens))


def _official_profile(host: str) -> str | None:
    for canonical, aliases in OFFICIAL_HOST_ALIASES.items():
        if host == canonical or host in aliases:
            return canonical
    return None


def _kind_from_result(title: str, url: str, requested_kind: str) -> str:
    if requested_kind == 'github' or _host(url) == 'github.com':
        return 'github'
    haystack = f'{title} {url}'.casefold()
    for kind in ('pricing', 'changelog', 'docs'):
        if any(hint in haystack for hint in PATH_HINTS[kind]):
            return kind
    return 'homepage'


def _github_is_plausibly_official(
    title: str,
    url: str,
    candidate_tokens: set[str],
    trusted_github_owners: set[str],
) -> bool:
    if _host(url) != 'github.com':
        return False
    parts = [part for part in urlparse(url).path.split('/') if part]
    if len(parts) < 2:
        return False
    owner, repository = parts[0].casefold(), parts[1].casefold()
    if owner not in trusted_github_owners:
        return False
    if _tokens(repository) & GITHUB_REPOSITORY_STOPWORDS:
        return False
    return bool(candidate_tokens & _tokens(f'{repository} {title}'))


def classify_source_result(
    result: dict[str, Any],
    *,
    candidate_title: str,
    seed_url: str,
    requested_kind: str,
    trusted_hosts: set[str],
    trusted_github_owners: set[str] | None = None,
) -> SourceMatch | None:
    raw_url = str(result.get('url') or '')
    url = canonical_url(raw_url)
    if not url:
        return None
    host = _host(url)
    if not host or _is_aggregator(host):
        return None
    candidate_tokens = _candidate_tokens(candidate_title, seed_url)
    title = str(result.get('title') or '').strip()
    if not _related_to_candidate(title, url, candidate_tokens):
        return None

    kind = _kind_from_result(title, url, requested_kind)
    if kind != 'github' and (host == 'github.com' or host.endswith('.github.com')):
        return None
    if kind == 'github':
        if not _github_is_plausibly_official(title, url, candidate_tokens, trusted_github_owners or set()):
            return None
        return SourceMatch(kind, url, title or url, 0.78, 'GitHub owner/repository matches candidate')

    registrable = _registrable_host(host)
    trusted = registrable in trusted_hosts
    if kind != 'homepage' and not trusted:
        return None
    if kind == 'homepage':
        registrable_tokens = _tokens(registrable)
        host_tokens = _tokens(host)
        result_tokens = _tokens(title)
        if not candidate_tokens & registrable_tokens:
            if registrable not in KNOWN_OFFICIAL_REGISTRABLE_HOSTS or not candidate_tokens & (host_tokens | result_tokens):
                return None
        if registrable in AGGREGATOR_HOSTS:
            return None
        if urlparse(url).path not in {'', '/'} and not any(token in _tokens(title) for token in candidate_tokens):
            return None
    confidence = 0.92 if trusted else 0.82 if kind == 'homepage' else 0.75
    reason = 'same first-party registrable host as homepage' if trusted else 'candidate identity matches official-looking result'
    return SourceMatch(kind, url, title or url, confidence, reason)


def find_first_party_sources(
    candidate_title: str,
    seed_url: str,
    search_fn: SearchFn,
) -> dict[str, SourceMatch]:
    matches, _failed_queries = find_first_party_sources_detailed(candidate_title, seed_url, search_fn)
    return matches


def find_first_party_sources_detailed(
    candidate_title: str,
    seed_url: str,
    search_fn: SearchFn,
) -> tuple[dict[str, SourceMatch], int]:
    queries = {
        'homepage': f'"{candidate_title}" official website',
        'pricing': f'"{candidate_title}" official pricing plans',
        'changelog': f'"{candidate_title}" official changelog release notes',
        'docs': f'"{candidate_title}" official documentation docs API',
        'github': f'"{candidate_title}" official GitHub repository releases',
    }
    matches: dict[str, SourceMatch] = {}
    trusted_hosts: set[str] = set()
    trusted_github_owners: set[str] = set()
    failed_queries = 0

    def fetch(kind: str) -> tuple[str, list[dict[str, Any]], bool]:
        try:
            return kind, search_fn(queries[kind]), False
        except Exception:
            return kind, [], True

    def accept_results(kind: str, results: list[dict[str, Any]]) -> None:
        nonlocal trusted_hosts, trusted_github_owners
        for result in results[:20]:
            match = classify_source_result(
                result,
                candidate_title=candidate_title,
                seed_url=seed_url,
                requested_kind=kind,
                trusted_hosts=trusted_hosts,
                trusted_github_owners=trusted_github_owners,
            )
            if not match or match.kind in matches:
                continue
            if kind == 'homepage' and match.kind != 'homepage':
                continue
            matches[match.kind] = match
            if match.kind == 'homepage':
                homepage_host = _registrable_host(_host(match.url))
                profile = _official_profile(homepage_host)
                trusted_hosts.add(homepage_host)
                if profile:
                    trusted_hosts.add(profile)
                    trusted_hosts.update(OFFICIAL_HOST_ALIASES.get(profile, set()))
                    trusted_github_owners.update(OFFICIAL_GITHUB_OWNERS.get(profile, set()))
            break

    kind, results, failed = fetch('homepage')
    failed_queries += int(failed)
    accept_results(kind, results)

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {kind: executor.submit(fetch, kind) for kind in SOURCE_KINDS if kind != 'homepage'}
        for kind in SOURCE_KINDS:
            if kind == 'homepage':
                continue
            _kind, results, failed = futures[kind].result()
            failed_queries += int(failed)
            accept_results(_kind, results)
    return matches, failed_queries


def canonical_tool_id(title: str, url: str = '') -> str:
    value = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().casefold()
    slug = re.sub(r'[^a-z0-9]+', '-', value).strip('-')
    if not slug:
        slug = re.sub(r'[^a-z0-9]+', '-', _host(url)).strip('-')
    return slug[:80] or 'discovered-tool'


def source_coverage(matches: dict[str, SourceMatch]) -> tuple[bool, float]:
    support_count = len(set(matches) - {'homepage'})
    confidence = min((match.confidence for match in matches.values()), default=0.0)
    return 'homepage' in matches and support_count >= 1, round(confidence, 4)


def _parse_date(raw: str) -> datetime | None:
    value = re.sub(r'(?<=\d)(?:st|nd|rd|th)', '', raw.strip().replace('Sept.', 'Sep'))
    value = re.sub(r'\bSept\b', 'Sep', value, flags=re.I)
    try:
        iso_value = value.replace('Z', '+00:00')
        parsed_iso = datetime.fromisoformat(iso_value)
        return (parsed_iso if parsed_iso.tzinfo else parsed_iso.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    except ValueError:
        pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _date_from_text(text: str) -> datetime | None:
    for found in DATE_RE.findall(text):
        parsed = _parse_date(found)
        if parsed:
            return parsed
    return None


def extract_recent_entries(
    markdown: str,
    *,
    now: datetime | None = None,
    days: int = 30,
    max_entries: int = 20,
) -> list[RecentEntry]:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    cutoff = now - timedelta(days=days)
    lines = markdown.splitlines()
    starts = [
        index for index, line in enumerate(lines)
        if re.match(r'^\s{0,3}#{1,6}\s+\S+', line)
    ]
    sections: list[tuple[str, str, datetime]] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        heading = re.sub(r'^\s{0,3}#{1,6}\s+', '', lines[start]).strip()
        section_lines = lines[start + 1:end]
        date = _date_from_text(heading) or _date_from_text('\n'.join(section_lines[:5]))
        if not date or not cutoff <= date <= now:
            continue
        body = '\n'.join(section_lines).strip()
        body = re.sub(r'\n{3,}', '\n\n', body)
        if len(body) < 24:
            continue
        sections.append((heading[:180], body[:5000], date))

    if not sections:
        for index, line in enumerate(lines):
            date = _date_from_text(line)
            if not date or not cutoff <= date <= now:
                continue
            body = '\n'.join(lines[index:index + 14]).strip()
            title = next((item.strip('# -*') for item in lines[index:index + 4] if item.strip()), line.strip())
            if len(body) >= 24:
                sections.append((title[:180], body[:5000], date))

    seen: set[str] = set()
    entries: list[RecentEntry] = []
    for title, body, date in sorted(sections, key=lambda item: item[2], reverse=True):
        key = hashlib.sha256(f'{title}\n{body}'.encode('utf-8')).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        entries.append(RecentEntry(title=title, body=body, published_at=date))
        if len(entries) >= max_entries:
            break
    return entries


def backfill_key(source_id: int, entry: RecentEntry) -> str:
    stable_title = re.sub(r'\s+', ' ', entry.title.casefold()).strip()
    payload = f'{source_id}:{entry.published_at.date().isoformat()}:{stable_title}'
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def change_kind_for_entry(source_kind: str, text: str) -> str:
    haystack = text.casefold()
    if source_kind == 'pricing' or re.search(r'\b(price|pricing|plan|tier|credit|billing)\b', haystack):
        return 'pricing'
    if re.search(r'\b(api|endpoint|sdk|model|release|version)\b', haystack):
        return 'api' if 'api' in haystack or 'endpoint' in haystack else 'model'
    return 'capability'
