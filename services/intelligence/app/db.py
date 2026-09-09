from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://shouldknow:shouldknow@postgres:5432/shouldknow")

@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def init_schema() -> None:
    schema = Path(__file__).resolve().parents[1] / "schema.sql"
    sql = schema.read_text(encoding="utf-8")
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def upsert_product(slug: str, name: str) -> None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into products (slug, name) values (%s, %s)
            on conflict (slug) do update set name = excluded.name, updated_at = now()
            """,
            (slug, name),
        )
        conn.commit()


def upsert_source(product_slug: str, url: str, source_type: str, first_party: bool) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into sources (product_id, url, source_type, first_party)
            select id, %s, %s, %s from products where slug = %s
            on conflict (url) do update set source_type = excluded.source_type, first_party = excluded.first_party
            returning id
            """,
            (url, source_type, first_party, product_slug),
        )
        row = cur.fetchone()
        conn.commit()
        if not row:
            raise RuntimeError(f"Product not found for source {url}")
        return int(row["id"])


def latest_snapshot(source_id: int) -> dict[str, Any] | None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            "select * from snapshots where source_id = %s order by captured_at desc limit 1",
            (source_id,),
        )
        return cur.fetchone()


def insert_snapshot(source_id: int, content_hash: str, markdown: str, metadata: dict[str, Any]) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into snapshots (source_id, content_hash, markdown, metadata)
            values (%s, %s, %s, %s::jsonb) returning id
            """,
            (source_id, content_hash, markdown, json.dumps(metadata)),
        )
        snapshot_id = int(cur.fetchone()["id"])
        conn.commit()
        return snapshot_id


def insert_candidate(source_id: int, before_snapshot_id: int | None, after_snapshot_id: int, diff: str, score: int, kind: str, impact: str, reasons: list[str], status: str) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into change_candidates
              (source_id, before_snapshot_id, after_snapshot_id, diff, materiality_score, kind, impact, reasons, status)
            values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            returning id
            """,
            (source_id, before_snapshot_id, after_snapshot_id, diff, score, kind, impact, json.dumps(reasons), status),
        )
        candidate_id = int(cur.fetchone()["id"])
        conn.commit()
        return candidate_id


def publish_signal(candidate_id: int, title: str, summary: str, why_it_matters: str, action: str | None, confidence: float) -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into signals (candidate_id, product_id, title, summary, why_it_matters, action, impact, kind, confidence, published_at)
            select c.id, s.product_id, %s, %s, %s, %s, c.impact, c.kind, %s, now()
            from change_candidates c join sources s on s.id = c.source_id
            where c.id = %s
            returning id
            """,
            (title, summary, why_it_matters, action, confidence, candidate_id),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"Candidate {candidate_id} not found")
        cur.execute("update change_candidates set status='published', reviewed_at=now() where id=%s", (candidate_id,))
        conn.commit()
        return int(row["id"])


def list_signals(limit: int = 100) -> list[dict[str, Any]]:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select sig.id, p.slug as product_slug, p.name as product, sig.title, sig.summary,
                   sig.why_it_matters, sig.action, sig.impact, sig.kind, sig.confidence,
                   sig.published_at, src.url as source_url, src.source_type, src.first_party
            from signals sig
            join products p on p.id = sig.product_id
            join change_candidates c on c.id = sig.candidate_id
            join sources src on src.id = c.source_id
            order by sig.published_at desc
            limit %s
            """,
            (limit,),
        )
        return list(cur.fetchall())


def product_dossier(slug: str) -> dict[str, Any] | None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("select id, slug, name, created_at, updated_at from products where slug=%s", (slug,))
        product = cur.fetchone()
        if not product:
            return None
        cur.execute(
            """
            select sig.id, sig.title, sig.summary, sig.why_it_matters, sig.action, sig.impact,
                   sig.kind, sig.confidence, sig.published_at, src.url as source_url, src.source_type
            from signals sig
            join change_candidates c on c.id=sig.candidate_id
            join sources src on src.id=c.source_id
            where sig.product_id=%s order by sig.published_at desc
            """,
            (product["id"],),
        )
        return {**product, "signals": list(cur.fetchall())}
