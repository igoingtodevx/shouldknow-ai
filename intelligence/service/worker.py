import argparse
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

from core import AUTO_PUBLISH_P0, classify, crawl, db, diff_lines, hash_text, init_db, load_watchset, search


def seed_watchset() -> None:
    with db() as conn, conn.cursor() as cur:
        for tool in load_watchset():
            canonical = tool['sources'][0]['url']
            cur.execute(
                '''INSERT INTO tools(id, name, canonical_url)
                   VALUES(%s,%s,%s)
                   ON CONFLICT(id) DO UPDATE SET name=excluded.name, canonical_url=excluded.canonical_url, updated_at=now()''',
                (tool['toolId'], tool['name'], canonical),
            )
            for source in tool['sources']:
                cur.execute(
                    '''INSERT INTO sources(tool_id, kind, url, first_party, crawl_every_minutes)
                       VALUES(%s,%s,%s,%s,%s)
                       ON CONFLICT(url) DO UPDATE SET
                         tool_id=excluded.tool_id, kind=excluded.kind, first_party=excluded.first_party,
                         crawl_every_minutes=excluded.crawl_every_minutes, enabled=true''',
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


def crawl_once() -> None:
    seed_watchset()
    for source_id, tool_id, tool_name, source_kind, url, first_party in source_rows():
        try:
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
                    # The newest snapshot already has this content hash.
                    conn.commit()
                    continue
                else:
                    # A historical hash can reappear after a later version. Reuse
                    # that immutable snapshot so the revert still becomes a diff.
                    cur.execute(
                        'SELECT id FROM snapshots WHERE source_id=%s AND content_hash=%s ORDER BY captured_at ASC LIMIT 1',
                        (source_id, digest),
                    )
                    historical = cur.fetchone()
                    if not historical:
                        conn.commit()
                        continue
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
            print(f'crawled {tool_name} {source_kind}: {url}')
        except Exception as exc:
            print(f'crawl failed {url}: {exc}')


def discover_once() -> None:
    queries = [
        'AI tool changelog pricing update',
        'AI agent release notes new API',
        'AI coding assistant pricing free tier change',
        'AI video model changelog API release',
    ]
    with db() as conn, conn.cursor() as cur:
        for query in queries:
            try:
                for result in search(query)[:20]:
                    url = result.get('url')
                    if not url or urlparse(url).scheme not in {'http', 'https'}:
                        continue
                    cur.execute(
                        '''INSERT INTO discovery_candidates(query, url, title, snippet)
                           VALUES(%s,%s,%s,%s)
                           ON CONFLICT(url) DO NOTHING''',
                        (query, url, result.get('title'), result.get('content') or result.get('snippet')),
                    )
            except Exception as exc:
                print(f'discovery failed {query}: {exc}')
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['crawl', 'discover', 'once', 'seed'], default='once', nargs='?')
    args = parser.parse_args()
    init_db()
    if args.mode in {'seed', 'crawl', 'once'}:
        seed_watchset()
    if args.mode in {'crawl', 'once'}:
        crawl_once()
    if args.mode in {'discover', 'once'}:
        discover_once()


if __name__ == '__main__':
    main()
