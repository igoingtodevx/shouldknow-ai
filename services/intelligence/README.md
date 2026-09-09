# Should Know intelligence service

This service is the server-side activation layer for Should Know. It monitors a deliberately small first-party source registry, captures immutable snapshots, computes diffs, filters obvious noise, optionally asks an OpenAI-compatible reviewer for a structured editorial decision, and exposes published signals through a read-only API.

## Safety / trust model

- Discovery is not evidence. SearXNG only generates candidates.
- The monitored watchset is first-party by default.
- Crawl targets are restricted to public HTTP(S) URLs; localhost, literal private IPs and local/internal hostnames are rejected before Crawl4AI is called.
- The worker uses Crawl4AI's non-streaming `/crawl` endpoint. Run a patched Crawl4AI release and keep its API behind authentication/network controls; do not expose an old unauthenticated crawler to the public internet.
- A first snapshot establishes a baseline and never publishes a fake “change”.
- Deterministic materiality filtering happens before any LLM review.
- `AUTO_PUBLISH=false` is the default. Turn it on only after reviewing real candidate quality.
- Published signals are append-only history; a new snapshot does not overwrite an old signal.

## Required existing services

- PostgreSQL (included in the repository-level compose file)
- SearXNG with JSON output enabled (`format=json`)
- Crawl4AI Docker API (recommended: current patched release + API token)
- Optional OpenAI-compatible LLM endpoint for editorial review

## Endpoints

- `GET /health`
- `GET /api/signals?limit=100`
- `GET /api/dossiers/{slug}`

## Worker

```bash
python -m app.worker --once
python -m app.worker
```

The first run baselines every source. Later runs create candidates only when normalized content hashes change.

## Discovery

```bash
python -m app.discovery --json
```

Discovery output is review material only. It does not modify the watchset or publish anything.
