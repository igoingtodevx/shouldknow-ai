import json
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core import db, diff_lines, init_db
from enrichment import canonical_url

app = FastAPI(title='Should Know Intelligence API', version='0.3.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['GET'],
    allow_headers=['*'],
)

ADMIN_TOKEN = os.getenv('SHOULDKNOW_ADMIN_TOKEN', '')


@app.on_event('startup')
def startup() -> None:
    init_db()


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/v1/signals')
def signals(hours: int = Query(168, ge=1, le=24 * 90)) -> list[dict[str, Any]]:
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''
            SELECT c.id, c.tool_id, t.name, c.kind, c.impact, c.detected_at,
                   c.title, c.summary, c.why_it_matters, c.evidence,
                   c.materiality, c.confidence, c.published_at
            FROM changes c
            JOIN tools t ON t.id = c.tool_id
            WHERE c.publication_status = 'published'
              AND c.detected_at >= now() - (%s * interval '1 hour')
            ORDER BY COALESCE(c.published_at, c.detected_at) DESC
            ''',
            (hours,),
        )
        rows = cur.fetchall()

    now = datetime.now(timezone.utc)
    result: list[dict[str, Any]] = []
    for row in rows:
        age_anchor = row[12] or row[5]
        age = max(0, int((now - age_anchor).total_seconds() // 3600))
        evidence = row[9] if isinstance(row[9], list) else json.loads(row[9] or '[]')
        result.append({
            'id': f'live-{row[0]}',
            'toolId': row[1],
            'tool': row[2],
            'kind': row[3],
            'impact': row[4],
            'ageHours': age,
            'detectedAt': row[5].isoformat(),
            'publishedAt': row[12].isoformat() if row[12] else None,
            'title': row[6],
            'summary': row[7],
            'whyItMatters': row[8],
            'sources': evidence,
            'materiality': row[10],
            'confidence': row[11],
            'prototype': False,
        })
    return result


def _safe_directory_candidate(candidate_url: str, source_url: str | None) -> bool:
    candidate = canonical_url(candidate_url)
    source = canonical_url(source_url or '')
    if not candidate or not source:
        return False
    candidate_host = (urlparse(candidate).hostname or '').casefold().removeprefix('www.')
    source_host = (urlparse(source).hostname or '').casefold().removeprefix('www.')
    return bool(candidate_host and candidate_host == source_host)


@app.get('/v1/discovery')
def discovery(limit: int = Query(12, ge=1, le=30)) -> list[dict[str, Any]]:
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''
            SELECT title, url, source_name, source_url, score, last_seen_at
            FROM discovery_candidates
            WHERE source_kind='directory'
              AND title IS NOT NULL
              AND last_seen_at >= now() - interval '14 days'
            ORDER BY score DESC, last_seen_at DESC
            LIMIT 500
            '''
        )
        rows = cur.fetchall()

    grouped: dict[str, dict[str, Any]] = {}
    for title, candidate_url, source_name, source_url, score, last_seen_at in rows:
        if not _safe_directory_candidate(candidate_url, source_url):
            continue
        key = re.sub(r'[^a-z0-9]+', '', title.casefold())
        if not key:
            continue
        item = grouped.setdefault(key, {
            'id': f'radar-{key[:48]}',
            'title': title,
            'score': float(score or 0),
            'lastSeenAt': last_seen_at.isoformat(),
            'sources': [],
        })
        item['score'] = max(item['score'], float(score or 0))
        if last_seen_at.isoformat() > item['lastSeenAt']:
            item['lastSeenAt'] = last_seen_at.isoformat()
        source = {
            'name': source_name or 'AI directory',
            'url': source_url or candidate_url,
            'candidateUrl': candidate_url,
        }
        if not any(existing['name'] == source['name'] for existing in item['sources']):
            item['sources'].append(source)

    items = list(grouped.values())
    for item in items:
        item['sourceCount'] = len(item['sources'])
    items.sort(key=lambda item: (item['sourceCount'], item['score'], item['lastSeenAt']), reverse=True)
    return items[:limit]


@app.get('/v1/tools')
def tools() -> list[dict[str, Any]]:
    with db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id, name, canonical_url, category, editorial_verdict, updated_at FROM tools ORDER BY name')
        return [
            {
                'id': row[0], 'name': row[1], 'url': row[2], 'category': row[3],
                'verdict': row[4], 'updatedAt': row[5].isoformat(),
            }
            for row in cur.fetchall()
        ]


@app.get('/v1/tools/{tool_id}')
def tool(tool_id: str) -> dict[str, Any]:
    with db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id, name, canonical_url, category, editorial_verdict, updated_at FROM tools WHERE id=%s', (tool_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail='Tool not found')
        cur.execute(
            '''SELECT kind, impact, detected_at, title, summary, why_it_matters, evidence, materiality, published_at
               FROM changes WHERE tool_id=%s AND publication_status='published'
               ORDER BY COALESCE(published_at, detected_at) DESC LIMIT 50''',
            (tool_id,),
        )
        history = [
            {
                'kind': item[0], 'impact': item[1], 'detectedAt': item[2].isoformat(),
                'title': item[3], 'summary': item[4], 'whyItMatters': item[5], 'sources': item[6],
                'materiality': item[7], 'publishedAt': item[8].isoformat() if item[8] else None,
            }
            for item in cur.fetchall()
        ]
    return {
        'id': row[0], 'name': row[1], 'url': row[2], 'category': row[3],
        'verdict': row[4], 'updatedAt': row[5].isoformat(), 'history': history,
    }


def require_admin(authorization: str | None) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail='Review API is disabled')
    prefix = 'Bearer '
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail='Missing admin bearer token')
    supplied = authorization[len(prefix):]
    if not secrets.compare_digest(supplied, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail='Invalid admin bearer token')


@app.get('/internal/v1/review')
def review_queue(
    status: Literal['review', 'published', 'rejected'] = Query('review'),
    limit: int = Query(50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    require_admin(authorization)
    with db() as conn, conn.cursor() as cur:
        cur.execute(
            '''
            SELECT c.id, c.tool_id, t.name, c.kind, c.impact, c.materiality, c.confidence,
                   c.detected_at, c.title, c.summary, c.why_it_matters, c.evidence,
                   c.publication_status, s.kind, s.url, s.first_party,
                   before.normalized_text, after.normalized_text,
                   c.reviewed_at, c.reviewed_by, c.review_note, c.published_at
            FROM changes c
            JOIN tools t ON t.id=c.tool_id
            JOIN sources s ON s.id=c.source_id
            LEFT JOIN snapshots before ON before.id=c.before_snapshot_id
            JOIN snapshots after ON after.id=c.after_snapshot_id
            WHERE c.publication_status=%s
            ORDER BY c.detected_at DESC
            LIMIT %s
            ''',
            (status, limit),
        )
        rows = cur.fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        evidence = row[11] if isinstance(row[11], list) else json.loads(row[11] or '[]')
        diff = diff_lines(row[16] or '', row[17] or '')
        result.append({
            'id': row[0], 'toolId': row[1], 'tool': row[2], 'kind': row[3],
            'impact': row[4], 'materiality': row[5], 'confidence': row[6],
            'detectedAt': row[7].isoformat(), 'title': row[8], 'summary': row[9],
            'whyItMatters': row[10], 'evidence': evidence, 'status': row[12],
            'source': {'kind': row[13], 'url': row[14], 'firstParty': bool(row[15])},
            'diff': diff,
            'reviewedAt': row[18].isoformat() if row[18] else None,
            'reviewedBy': row[19], 'reviewNote': row[20],
            'publishedAt': row[21].isoformat() if row[21] else None,
        })
    return result


class ReviewAction(BaseModel):
    decision: Literal['publish', 'reject', 'review']
    reviewer: str = Field(default='manual', min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=2000)
    title: str | None = Field(default=None, min_length=1, max_length=300)
    summary: str | None = Field(default=None, min_length=1, max_length=4000)
    whyItMatters: str | None = Field(default=None, min_length=1, max_length=4000)
    kind: Literal['capability', 'pricing', 'model', 'api', 'policy', 'launch'] | None = None
    impact: Literal['high', 'medium', 'low'] | None = None


@app.patch('/internal/v1/review/{change_id}')
def review_change(
    change_id: int,
    action: ReviewAction,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_admin(authorization)
    new_status = {'publish': 'published', 'reject': 'rejected', 'review': 'review'}[action.decision]
    with db() as conn, conn.cursor() as cur:
        cur.execute('SELECT id FROM changes WHERE id=%s FOR UPDATE', (change_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail='Change not found')
        cur.execute(
            '''
            UPDATE changes SET
              title=COALESCE(%s, title),
              summary=COALESCE(%s, summary),
              why_it_matters=COALESCE(%s, why_it_matters),
              kind=COALESCE(%s, kind),
              impact=COALESCE(%s, impact),
              publication_status=%s,
              reviewed_at=now(),
              reviewed_by=%s,
              review_note=%s,
              published_at=CASE WHEN %s='published' THEN now() ELSE NULL END
            WHERE id=%s
            RETURNING id, publication_status, reviewed_at, published_at
            ''',
            (
                action.title, action.summary, action.whyItMatters, action.kind, action.impact,
                new_status, action.reviewer, action.note, new_status, change_id,
            ),
        )
        row = cur.fetchone()
        conn.commit()
    return {
        'id': row[0], 'status': row[1], 'reviewedAt': row[2].isoformat(),
        'publishedAt': row[3].isoformat() if row[3] else None,
    }
