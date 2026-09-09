import json
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from core import db, init_db

app = FastAPI(title='Should Know Intelligence API', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['GET'],
    allow_headers=['*'],
)

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
                   c.title, c.summary, c.why_it_matters, c.evidence
            FROM changes c
            JOIN tools t ON t.id = c.tool_id
            WHERE c.publication_status = 'published'
              AND c.detected_at >= now() - (%s * interval '1 hour')
            ORDER BY c.detected_at DESC
            ''',
            (hours,),
        )
        rows = cur.fetchall()

    now = datetime.now(timezone.utc)
    result: list[dict[str, Any]] = []
    for row in rows:
        age = max(0, int((now - row[5]).total_seconds() // 3600))
        evidence = row[9] if isinstance(row[9], list) else json.loads(row[9] or '[]')
        result.append({
            'id': f'live-{row[0]}',
            'toolId': row[1],
            'tool': row[2],
            'kind': row[3],
            'impact': row[4],
            'ageHours': age,
            'title': row[6],
            'summary': row[7],
            'whyItMatters': row[8],
            'sources': evidence,
            'prototype': False,
        })
    return result

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
            '''SELECT kind, impact, detected_at, title, summary, why_it_matters, evidence
               FROM changes WHERE tool_id=%s AND publication_status='published'
               ORDER BY detected_at DESC LIMIT 50''',
            (tool_id,),
        )
        history = [
            {
                'kind': item[0], 'impact': item[1], 'detectedAt': item[2].isoformat(),
                'title': item[3], 'summary': item[4], 'whyItMatters': item[5], 'sources': item[6],
            }
            for item in cur.fetchall()
        ]
    return {
        'id': row[0], 'name': row[1], 'url': row[2], 'category': row[3],
        'verdict': row[4], 'updatedAt': row[5].isoformat(), 'history': history,
    }
