# Intelligence engine

This folder is the deployable boundary between the public Vite frontend and the VPS intelligence services.

## Included now

- `watchset.json` — known first-party pages worth snapshotting.
- `service/core.py` — normalization, hashing, line diff, deterministic materiality and SearXNG/Crawl4AI adapters.
- `service/worker.py` — watchset seeding, crawl runs, snapshot persistence, change creation and discovery capture.
- `service/schema.sql` — tools, sources, immutable snapshots, reviewable changes and discovery candidates.
- `service/app.py` — public read API plus an authenticated manual review gate.
- `crawl4ai_bridge.py` — host bridge for the installed Crawl4AI library.
- `service/test_core.py` — regression coverage for the normalization/materiality bugs found during shadow runs.
- `materiality.mjs`, `diff.mjs`, `demo-run.mjs` — small dependency-free reference/smoke helpers retained from the initial scaffold.

## Processing contract

The worker:

1. seeds a narrow known-product watchset;
2. crawls first-party sources through Crawl4AI;
3. normalizes volatile tracking, consent and known dynamic metric noise;
4. hashes normalized text and skips unchanged content;
5. reuses immutable historical snapshots when a page reverts to a previous hash;
6. diffs changed snapshots;
7. drops obvious P2 noise;
8. stores P0/P1/ambiguous changes in `review` state;
9. stores search-discovered candidates separately from verified tools/signals.

SearXNG is discovery, not truth. Public signals should retain first-party evidence wherever possible.

## Publication gate

Automatic publication is hard-disabled in code during this rollout (`AUTO_PUBLISH_P0 = False`). It cannot be enabled by an environment variable.

Public endpoints expose only `publication_status='published'`:

```text
GET /health
GET /v1/signals
GET /v1/tools
GET /v1/tools/{tool_id}
```

Manual review is available through authenticated internal endpoints:

```text
GET   /internal/v1/review?status=review
PATCH /internal/v1/review/{change_id}
```

They require:

```http
Authorization: Bearer <SHOULDKNOW_ADMIN_TOKEN>
```

If `SHOULDKNOW_ADMIN_TOKEN` is missing, internal review is disabled with HTTP 503. The token is server-only and must never be added to Vite/Vercel frontend variables.

A review action can explicitly publish, reject or retain a record in review and may correct the machine-generated title, summary, `whyItMatters`, kind or impact before publication. Review audit metadata and `published_at` are persisted.

## Live VPS wiring (feat/signal-intelligence-v1-3)

Verified against the real VPS services:

- SearXNG: `http://127.0.0.1:8888` (docker, host loopback). Its JSON response uses `results[]` with `url`/`title`/`content`.
- Crawl4AI: installed as the `crawl4ai` 0.8.9 library + MCP venv at `/home/deploy/.local/share/crawl4ai/venv`; `crawl4ai_bridge.py` exposes the real engine at `127.0.0.1:11235` for the worker's `POST /crawl` contract.
- Postgres: `docker compose -f docker-compose.intelligence.yml up -d postgres` publishes loopback-only `127.0.0.1:5432`.
- API/worker currently run as host processes because SearXNG is loopback-bound and host port 8080 is occupied.
- API was verified on `127.0.0.1:8095` during the shadow run.
- Caddy deliberately had no public Should Know API route during shadow verification.
- The worker is currently one-shot, not a permanent scheduler/daemon.

## Verified shadow behaviour

The VPS pass verified real SearXNG and Crawl4AI calls, Postgres persistence, API reads, partial crawl failure isolation, historical-revert detection and stable repeated no-change crawls after normalization fixes.

The shadow database contains pre-fix/test history and must not be treated as publishable editorial data merely because a row is P0/P1. Every current change remains behind the review gate until deliberately reviewed.

## Next deployment step

Before switching the public frontend to the live API:

1. deploy the current branch revision to the VPS service code;
2. configure a strong `SHOULDKNOW_ADMIN_TOKEN` server-side;
3. run the schema upgrade via normal API/worker initialization;
4. review/reject the historical shadow/test changes;
5. expose only the read API through a dedicated Caddy route;
6. set `VITE_INTELLIGENCE_API` in the Vercel preview;
7. verify the frontend shows only explicitly published live records;
8. keep crawling in narrow shadow/review mode before expanding the watchset or adding a scheduler.
