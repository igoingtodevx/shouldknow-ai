import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

from core import AUTO_PUBLISH_P0, classify, crawl, db, diff_lines, hash_text, init_db, load_watchset, search
from discovery import extract_directory_candidates, load_discovery_sources
from enrichment_worker import enrich_once
from enrichment import canonical_url


def seed_watchset() -> None:
    with db() as conn, conn.cursor() as cur:
        for tool in load_watchset():
            canonical = tool['sources'][0]['url']
            cur.execute(
                '''INSERT INTO tools(id, name, canonical_url)
                   VALUES(%s,%s,%s)
                   ON CONFLICT(id) DO NOTHING''',
                (tool['toolId'], tool['name'], canonical),
            )
            for source in tool['sources']:
                cur.execute(
                    '''INSERT INTO sources(tool_id, kind, url, first_party, crawl_every_minutes)
                       VALUES(%s,%s,%s,%s,%s)
                       ON CONFLICT(url) DO NOTHING''',
                    (tool['toolId'], source['kind'], source['url'], source.get('firstParty', True), source.get('crawlEveryMinutes', 360)),
                )
        conn.commit()


def source_rows():
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''SELECT s.id, s.tool_id, t.name, s.kind, s.url, s.first_party
               FROM sources s JOIN tools t ON t.id=s.tool_id
               WHERE s.enabled=true
                 AND (s.last_crawled_at IS NULL OR s.last_crawled_at <= now() - (s.crawl_every_minutes * interval '1 minute'))
               ORDER BY COALESCE(s.last_crawled_at, to_timestamp(0)) ASC'''
        )
        return cur.fetchall()


def summarize_change(tool_name: str, source_kind: str, materiality: str, diff: dict) -> tuple[str, str, str, str, str]:
    added = [line for line in diff['added'] if len(line) < 220][:3]
    removed = [line for line in diff['removed'] if len(line) < 220][:2]
    kind = 'pricing' if source_kind == 'pricing' else 'policy' if source_kind == 'policy' else 'capability'
    impact = 'high' if materiality == 'P0' else 'medium' if materiality == 'P1' else 'low'
    title = f'{tool_name}: material change detected on {source_kind}'
    summary_bits = []
    if added:
        summary_bits.append('Added: ' + ' · '.join(added))
    if removed:
        summary_bits.append('Removed: ' + ' · '.join(removed))
    summary = ' '.join(summary_bits)[:1200] or 'Normalized source content changed and requires review.'
    why = 'This is a machine-generated pre-review summary. Publish only after the evidence and user impact have been checked.'
    return kind, impact, title, summary, why


@dataclass(frozen=True)
class CrawlRunResult:
    due: int
    success: int
    failed: int


def crawl_exit_code(result: CrawlRunResult) -> int:
    return 1 if result.failed else 0


@dataclass(frozen=True)
class DiscoveryRunResult:
    directory_sources: int
    directory_success: int
    directory_failed: int
    directory_candidates: int
    search_queries: int = 0
    search_failed: int = 0


def _directory_search_fallback(source) -> list[dict]:
    host = urlparse(source['url']).hostname or ''
    prefix = (source.get('candidatePathPrefixes') or ['/'])[0]
    if not host:
        return []
    results = search(f'site:{host}{prefix} AI')
    markdown = ' '.join(
        f"[{item.get('title') or ''}]({item.get('url') or ''})"
        for item in results[:30]
        if item.get('url')
    )
    return extract_directory_candidates(markdown, source)


def _looks_like_directory_challenge(markdown: str) -> bool:
    haystack = markdown.casefold()
    return any(marker in haystack for marker in (
        'captcha', 'verify you are human', 'verify your identity', 'access denied',
        'just a moment', 'checking your browser', 'enable javascript',
    ))


def _store_directory_candidates(cur, source, candidates, query: str) -> None:
    for candidate in candidates:
        _upsert_discovery_candidate(
            cur,
            query=query,
            url=candidate['url'],
            title=candidate['title'],
            snippet=None,
            source_name=candidate['sourceName'],
            source_url=candidate['sourceUrl'],
            source_kind='directory',
            score=float(candidate['score']),
        )


def _crawl_source(row) -> None:
    source_id, tool_id, tool_name, source_kind, url, first_party = row
    text = crawl(url)
    digest = hash_text(text)
    with db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id, normalized_text, content_hash FROM snapshots WHERE source_id=%s ORDER BY captured_at DESC LIMIT 1', (source_id,))
        previous = cur.fetchone()
        cur.execute(
            '''INSERT INTO snapshots(source_id, content_hash, normalized_text, http_status)
               VALUES(%s,%s,%s,200)
               ON CONFLICT(source_id, content_hash) DO NOTHING
               RETURNING id''',
            (source_id, digest, text),
        )
        inserted = cur.fetchone()
        cur.execute('UPDATE sources SET last_crawled_at=now() WHERE id=%s', (source_id,))
        if inserted:
            after_id = inserted[0]
        elif not previous or previous[2] == digest:
            conn.commit()
            return
        else:
            cur.execute(
                'SELECT id FROM snapshots WHERE source_id=%s AND content_hash=%s ORDER BY captured_at ASC LIMIT 1',
                (source_id, digest),
            )
            historical = cur.fetchone()
            if not historical:
                conn.commit()
                return
            after_id = historical[0]
        if previous:
            diff = diff_lines(previous[1], text)
            materiality, reason = classify(diff)
            if materiality != 'P2':
                kind, impact, title, summary, why = summarize_change(tool_name, source_kind, materiality, diff)
                status = 'published' if AUTO_PUBLISH_P0 and materiality == 'P0' else 'review'
                evidence = [{'label': f'Official {source_kind}', 'url': url, 'firstParty': bool(first_party)}]
                cur.execute(
                    '''INSERT INTO changes(tool_id, source_id, before_snapshot_id, after_snapshot_id,
                       kind, impact, materiality, confidence, title, summary, why_it_matters,
                       publication_status, evidence)
                       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)''',
                    (tool_id, source_id, previous[0], after_id, kind, impact, materiality,
                     0.9 if materiality == 'P0' else 0.7, title, summary,
                     why + ' ' + reason, status, json.dumps(evidence)),
                )
        conn.commit()


def process_crawl_sources(rows, process_source=_crawl_source) -> CrawlRunResult:
    rows = list(rows)
    successes = 0
    failures = 0
    for row in rows:
        try:
            process_source(row)
        except Exception as exc:
            failures += 1
            print(f'crawl failed {row[4]}: {exc}')
        else:
            successes += 1
            print(f'crawled {row[2]} {row[3]}: {row[4]}')
    return CrawlRunResult(due=len(rows), success=successes, failed=failures)


def crawl_once() -> CrawlRunResult:
    seed_watchset()
    result = process_crawl_sources(source_rows())
    print(f'crawl summary: due={result.due} success={result.success} failed={result.failed}')
    return result


def _upsert_discovery_candidate(
    cur,
    *,
    query: str,
    url: str,
    title: str | None,
    snippet: str | None,
    source_name: str | None,
    source_url: str | None,
    source_kind: str,
    score: float,
) -> None:
    cur.execute(
        '''INSERT INTO discovery_candidates(
             query, url, title, snippet, source_name, source_url, source_kind, score, last_seen_at, seen_count
           ) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,now(),1)
           ON CONFLICT(url) DO UPDATE SET
             query=excluded.query,
             title=COALESCE(excluded.title, discovery_candidates.title),
             snippet=COALESCE(excluded.snippet, discovery_candidates.snippet),
             source_name=CASE WHEN discovery_candidates.source_kind='directory'
                              THEN COALESCE(discovery_candidates.source_name, excluded.source_name)
                              ELSE COALESCE(excluded.source_name, discovery_candidates.source_name) END,
             source_url=CASE WHEN discovery_candidates.source_kind='directory'
                             THEN COALESCE(discovery_candidates.source_url, excluded.source_url)
                             ELSE COALESCE(excluded.source_url, discovery_candidates.source_url) END,
             source_kind=CASE WHEN discovery_candidates.source_kind='directory'
                              THEN 'directory' ELSE excluded.source_kind END,
             score=GREATEST(discovery_candidates.score, excluded.score),
             last_seen_at=now(),
             seen_count=discovery_candidates.seen_count + 1''',
        (query, url, title, snippet, source_name, source_url, source_kind, score),
    )


def discover_once() -> DiscoveryRunResult:
    queries = [
        'AI tool changelog pricing update',
        'AI agent release notes new API',
        'AI coding assistant pricing free tier change',
        'AI video model changelog API release',
    ]
    search_failed = 0
    with db() as conn, conn.cursor() as cur:
        for query in queries:
            try:
                for result in search(query)[:20]:
                    url = canonical_url(str(result.get('url') or ''))
                    if not url:
                        continue
                    _upsert_discovery_candidate(
                        cur,
                        query=query,
                        url=url,
                        title=result.get('title'),
                        snippet=result.get('content') or result.get('snippet'),
                        source_name='Search discovery',
                        source_url=None,
                        source_kind='search',
                        score=0.5,
                    )
            except Exception as exc:
                search_failed += 1
                print(f'discovery failed {query}: {exc}')

        directory_sources = load_discovery_sources()
        directory_success = 0
        directory_failed = 0
        directory_candidate_count = 0
        for source in directory_sources:
            try:
                markdown = crawl(source['url'])
                candidates = extract_directory_candidates(markdown, source)
                if not candidates or _looks_like_directory_challenge(markdown):
                    raise RuntimeError('directory returned no usable candidates or a challenge page')
                _store_directory_candidates(cur, source, candidates, f"directory:{source['id']}")
                directory_success += 1
                directory_candidate_count += len(candidates)
                print(f"directory discovery {source['name']}: {len(candidates)} candidates")
            except Exception as exc:
                try:
                    candidates = _directory_search_fallback(source)
                except Exception as fallback_exc:
                    candidates = []
                    print(f"directory fallback failed {source['name']}: {fallback_exc}")
                if candidates:
                    fallback_source = dict(source)
                    fallback_source['name'] = f"{source['name']} (SearXNG fallback)"
                    _store_directory_candidates(cur, fallback_source, candidates, f"directory:{source['id']}:search-fallback")
                    directory_success += 1
                    directory_candidate_count += len(candidates)
                    print(f"directory discovery {source['name']}: {len(candidates)} candidates via SearXNG fallback")
                else:
                    directory_failed += 1
                    print(f"directory discovery failed {source['name']}: {exc}")
        conn.commit()
    result = DiscoveryRunResult(
        directory_sources=len(directory_sources),
        directory_success=directory_success,
        directory_failed=directory_failed,
        directory_candidates=directory_candidate_count,
        search_queries=len(queries),
        search_failed=search_failed,
    )
    print(
        f'discovery summary: sources={result.directory_sources} success={result.directory_success} '
        f'failed={result.directory_failed} candidates={result.directory_candidates} '
        f'search_failed={result.search_failed}'
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['crawl', 'discover', 'enrich', 'once', 'seed'], default='once', nargs='?')
    parser.add_argument('--limit', type=int, default=5)
    parser.add_argument('--days', type=int, default=30)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100:
        parser.error('--limit must be between 1 and 100')
    if args.days != 30:
        parser.error('--days is fixed at 30 for review backfill')
    init_db()
    exit_code = 0
    if args.mode in {'seed', 'crawl', 'once'}:
        seed_watchset()
    if args.mode in {'crawl', 'once'}:
        exit_code = crawl_exit_code(crawl_once())
    if args.mode in {'discover', 'once'}:
        discovery_result = discover_once()
        if discovery_result.directory_failed or discovery_result.search_failed:
            exit_code = max(exit_code, 1)
    if args.mode == 'enrich':
        enrichment_result = enrich_once(limit=args.limit, days=args.days)
        if enrichment_result.get('failed', 0) or enrichment_result.get('partial', 0):
            exit_code = 1
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
