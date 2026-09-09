# Intelligence engine scaffold

This folder is the deployable boundary between the public Vite frontend and the future VPS intelligence services.

It is intentionally dependency-light and safe to run locally before SearXNG/Crawl4AI are connected.

## Included now

- `watchset.json` — first-party pages worth snapshotting for the initial known-product set.
- `materiality.mjs` — deterministic pre-classifier for obvious P0/P1/P2 signals.
- `diff.mjs` — normalized line-level diff helper.
- `demo-run.mjs` — small local smoke test for the classifier and diff logic.

Run:

```bash
node intelligence/demo-run.mjs
```

## VPS integration contract

The production worker should:

1. ask SearXNG for discovery candidates on a separate schedule;
2. send known source URLs or candidates to Crawl4AI;
3. normalize extracted content;
4. hash and persist snapshots;
5. skip unchanged content;
6. diff changed snapshots;
7. apply deterministic materiality rules;
8. send only ambiguous/material changes to an LLM classifier;
9. verify first-party evidence;
10. persist a publishable change record.

The frontend must never scrape vendor sites directly.

## Safety rule

Do not auto-publish on the first live run. Capture baselines and inspect classifier behaviour for several days first.

## Live VPS wiring (feat/signal-intelligence-v1-3)

Verified against the real VPS services:

- SearXNG: `http://127.0.0.1:8888` (docker, host loopback). Its JSON search
  response (`results[]` with `url`/`title`/`content`) matches `core.search()` as-is.
- Crawl4AI: installed as the `crawl4ai` 0.8.9 library + MCP venv at
  `/home/deploy/.local/share/crawl4ai/venv` — that distribution ships no REST
  server, so `crawl4ai_bridge.py` exposes the engine's real crawls over the
  HTTP contract the worker expects (`POST /crawl`, body `{"urls": [...]}`).
  Run it with that venv's python, e.g. `--host 127.0.0.1 --port 11235`.
- Postgres: `docker compose -f docker-compose.intelligence.yml up -d postgres`
  publishes `127.0.0.1:5432` (loopback only).
- API/worker currently run as host processes (venv, `intelligence/service/.env.example`)
  because SearXNG is loopback-bound and host port 8080 is taken; the compose
  `api`/`worker` services remain the container path for later.
- `AUTO_PUBLISH_P0=false` is mandatory until thresholds are reviewed.

