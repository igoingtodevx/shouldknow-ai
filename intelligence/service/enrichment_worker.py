from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Callable

from core import AUTO_PUBLISH_P0, crawl, db, search
from enrichment import (
    RecentEntry,
    SourceMatch,
    backfill_key,
    canonical_tool_id,
    change_kind_for_entry,
    extract_recent_entries,
    find_first_party_sources_detailed,
    source_coverage,
)


BACKFILL_SOURCE_KINDS = ('changelog', 'github', 'docs')


def _materiality_for_entry(entry: RecentEntry) -> tuple[str, str, str]:
    text = f'{entry.title}\n{entry.body}'.casefold()
    if re.search(r'\b(price|pricing|plan|tier|credit|billing|deprecated|breaking|shutdown|policy|privacy|rate limit)\b', text):
        return 'P0', 'high', 'pricing'
    if re.search(r'\b(api|endpoint|sdk|model|release|version|integration|workflow|agent|browser)\b', text):
        return 'P1', 'medium', change_kind_for_entry('changelog', text)
    return 'REVIEW', 'low', 'capability'


def _upsert_tool_and_sources(
    candidate_id: int,
    candidate_title: str,
    candidate_url: str,
    matches: dict[str, SourceMatch],
) -> tuple[str, dict[str, int], str]:
    homepage = matches['homepage']
    base_tool_id = canonical_tool_id(candidate_title, homepage.url or candidate_url)
    assigned_sources: dict[str, int] = {}
    notes: list[str] = []
    with db() as conn, conn.cursor() as cur:
        cur.execute('SELECT canonical_url FROM tools WHERE id=%s', (base_tool_id,))
        existing_tool = cur.fetchone()
        tool_id = base_tool_id
        if existing_tool and existing_tool[0] != homepage.url:
            tool_id = f'{base_tool_id}-{hashlib.sha256(homepage.url.encode("utf-8")).hexdigest()[:8]}'
        cur.execute(
            '''INSERT INTO tools(id, name, canonical_url, category, editorial_verdict)
               VALUES(%s,%s,%s,%s,%s)
               ON CONFLICT(id) DO NOTHING''',
            (
                tool_id,
                candidate_title,
                homepage.url,
                'Discovered',
                'Directory candidate with first-party sources; review before publication.',
            ),
        )
        for kind, match in matches.items():
            cur.execute('SELECT id, tool_id, first_party, enabled, kind FROM sources WHERE url=%s', (match.url,))
            existing = cur.fetchone()
            if existing:
                if existing[1] != tool_id:
                    notes.append(f'{kind}: URL already belongs to another tool')
                    continue
                if not existing[2] or not existing[3]:
                    notes.append(f'{kind}: existing source is disabled/non-first-party')
                    continue
                if existing[4] != kind:
                    notes.append(f'{kind}: existing source kind is {existing[4]}')
                    continue
                assigned_sources[kind] = existing[0]
                continue
            cur.execute(
                '''INSERT INTO sources(tool_id, kind, url, first_party, crawl_every_minutes, enabled, source_confidence)
                   VALUES(%s,%s,%s,true,360,true,%s)
                   RETURNING id''',
                (tool_id, kind, match.url, match.confidence),
            )
            assigned_sources[kind] = cur.fetchone()[0]
        if 'homepage' not in assigned_sources:
            raise RuntimeError('source upsert produced no usable first-party homepage')
        conn.commit()
    return tool_id, assigned_sources, '; '.join(notes)


def _mark_candidate(
    candidate_id: int,
    *,
    status: str,
    note: str,
    tool_id: str | None = None,
) -> None:
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''UPDATE discovery_candidates
               SET enriched_tool_id=COALESCE(%s, enriched_tool_id),
                   enrichment_status=%s,
                   enrichment_checked_at=now(),
                   enrichment_note=%s
               WHERE id=%s''',
            (tool_id, status, note[:1000], candidate_id),
        )
        conn.commit()


def _backfill_entries(
    *,
    tool_id: str,
    tool_name: str,
    source_id: int,
    source_kind: str,
    source_url: str,
    entries: list[RecentEntry],
) -> int:
    created = 0
    with db() as conn, conn.cursor() as cur:
        for entry in entries:
            key = backfill_key(source_id, entry)
            materiality, impact, kind = _materiality_for_entry(entry)
            normalized = f'# {entry.title}\n\n{entry.body}'.strip()
            digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
            cur.execute(
                '''INSERT INTO snapshots(source_id, content_hash, normalized_text, http_status)
                   VALUES(%s,%s,%s,200)
                   ON CONFLICT(source_id, content_hash) DO NOTHING
                   RETURNING id''',
                (source_id, digest, normalized),
            )
            inserted = cur.fetchone()
            if inserted:
                snapshot_id = inserted[0]
            else:
                cur.execute(
                    'SELECT id FROM snapshots WHERE source_id=%s AND content_hash=%s',
                    (source_id, digest),
                )
                snapshot_id = cur.fetchone()[0]
            evidence = [{
                'label': f'Official {source_kind}',
                'url': source_url,
                'firstParty': True,
            }]
            cur.execute(
                '''INSERT INTO changes(
                     tool_id, source_id, before_snapshot_id, after_snapshot_id, detected_at,
                     kind, impact, materiality, confidence, title, summary, why_it_matters,
                     publication_status, evidence, backfill_key
                   ) VALUES(%s,%s,NULL,%s,%s,%s,%s,%s,%s,%s,%s,%s,'review',%s::jsonb,%s)
                   ON CONFLICT(backfill_key) WHERE backfill_key IS NOT NULL DO NOTHING''',
                (
                    tool_id,
                    source_id,
                    snapshot_id,
                    entry.published_at,
                    kind,
                    impact,
                    materiality,
                    0.8 if materiality == 'P0' else 0.65,
                    f'{tool_name}: {entry.title}'[:240],
                    entry.body[:5000],
                    f'30-day first-party backfill from {source_kind}. Manual review is required before publication.',
                    json.dumps(evidence),
                    key,
                ),
            )
            created += cur.rowcount
        conn.commit()
    return created


def _candidate_rows(limit: int, scan_limit: int) -> list[tuple[Any, ...]]:
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''SELECT id, title, url, score
               FROM discovery_candidates
               WHERE source_kind='directory'
                 AND title IS NOT NULL
                 AND (enrichment_status IS NULL OR enrichment_status IN ('pending', 'partial'))
               ORDER BY score DESC, last_seen_at DESC
               LIMIT %s''',
            (scan_limit,),
        )
        return cur.fetchall()


def enrich_once(
    *,
    limit: int = 5,
    days: int = 30,
    search_fn: Callable[[str], list[dict[str, Any]]] = search,
    crawl_fn: Callable[[str], str] = crawl,
) -> dict[str, int]:
    if limit < 1:
        raise ValueError('limit must be at least 1')
    rows = _candidate_rows(limit, max(limit * 4, 20))
    enriched = 0
    scanned = 0
    source_count = 0
    change_count = 0
    partial = 0
    failed = 0
    now = datetime.now(timezone.utc)

    for candidate_id, title, seed_url, _score in rows:
        if enriched >= limit:
            break
        scanned += 1
        matches, search_failures = find_first_party_sources_detailed(title, seed_url, search_fn)
        if search_failures:
            failed += 1
        verified: dict[str, SourceMatch] = {}
        bodies: dict[str, str] = {}
        for kind, match in matches.items():
            try:
                body = crawl_fn(match.url)
            except Exception:
                continue
            if not body or len(body.strip()) < 40:
                continue
            verified[kind] = match
            bodies[kind] = body
        good, _confidence = source_coverage(verified)
        validation_failures = set(matches) - set(verified)
        if not good:
            partial += 1
            if validation_failures and not search_failures:
                failed += 1
            note = 'verified source coverage insufficient: ' + ','.join(sorted(verified))
            if search_failures:
                note += f'; source_search_failures={search_failures}'
            if validation_failures:
                note += '; failed_sources=' + ','.join(sorted(validation_failures))
            _mark_candidate(candidate_id, status='partial', note=note)
            continue

        try:
            tool_id, source_ids, note = _upsert_tool_and_sources(candidate_id, title, seed_url, verified)
        except Exception as exc:
            failed += 1
            _mark_candidate(candidate_id, status='partial', note=f'source upsert failed: {exc}')
            continue

        source_assignment_failures = set(verified) - set(source_ids)
        backfill_failures: list[str] = []
        for kind in BACKFILL_SOURCE_KINDS:
            source_id = source_ids.get(kind)
            body = bodies.get(kind)
            if not source_id or not body:
                continue
            try:
                entries = extract_recent_entries(body, now=now, days=days, max_entries=10)
                if entries:
                    change_count += _backfill_entries(
                        tool_id=tool_id,
                        tool_name=title,
                        source_id=source_id,
                        source_kind=kind,
                        source_url=verified[kind].url,
                        entries=entries,
                    )
            except Exception as exc:
                backfill_failures.append(f'{kind}: {exc}')

        if search_failures or validation_failures or source_assignment_failures or backfill_failures:
            partial += 1
            if not search_failures:
                failed += 1
            status = 'partial'
            status_note = 'validated=' + ','.join(sorted(verified))
            if search_failures:
                status_note += f'; source_search_failures={search_failures}'
            if validation_failures:
                status_note += '; retry_sources=' + ','.join(sorted(validation_failures))
            if source_assignment_failures:
                status_note += '; source_assignment_failures=' + ','.join(sorted(source_assignment_failures))
            if backfill_failures:
                status_note += '; backfill_failures=' + '; '.join(backfill_failures)
        else:
            enriched += 1
            status = 'enriched'
            status_note = 'validated_source_kinds=' + ','.join(sorted(verified))
        _mark_candidate(candidate_id, status=status, note=status_note, tool_id=tool_id)
        source_count += len(source_ids)
        print(f'enriched {title}: sources={len(source_ids)} backfill_changes={change_count} status={status}')
        if note:
            print(f'enrichment note {title}: {note}')

    print(
        f'enrichment summary: scanned={scanned} enriched={enriched} partial={partial} '
        f'failed={failed} sources={source_count} changes={change_count} auto_publish={AUTO_PUBLISH_P0}'
    )
    return {
        'scanned': scanned,
        'enriched': enriched,
        'partial': partial,
        'failed': failed,
        'sources': source_count,
        'changes': change_count,
    }
