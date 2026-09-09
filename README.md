# Should Know — signal over volume

Should Know is evolving from a static AI-tool directory into a product-intelligence surface: a small feed of changes that are worth acting on, backed by first-party evidence and organised around a personal watchlist.

## Current branch architecture

The current product surface has three layers:

1. **Today** — a consequence-first change feed. Each signal carries impact, change type, why it matters, optional action/deadline and explicit evidence links.
2. **Watchlist** — browser-local product tracking. No account is required; the watchlist is stored locally and becomes the basis for “changes to my stack”.
3. **Library** — the original 70-tool catalog remains as a baseline discovery/watchset. The old 9.x score is deliberately no longer shown as if it were objective precision.

Selecting any product opens a **living dossier** that combines its old baseline context with captured change history and evidence sources.

## Verified seed feed

The frontend ships with a deliberately small set of real, first-party-sourced changes so the product can be evaluated before an automated crawler is trusted. The seed feed is not presented as a live scanner.

## Intelligence service

`services/intelligence/` now contains the server-side activation layer for continuous monitoring:

```text
SearXNG / targeted source monitors
        ↓
possible change
        ↓
Crawl4AI extraction
        ↓
immutable source snapshot
        ↓
previous ↔ current diff
        ↓
deterministic materiality filter
        ↓
optional structured LLM review
        ↓
published change + evidence
        ↓
read-only API
```

The repository-level `docker-compose.intelligence.yml` runs PostgreSQL, the read API and the worker while reusing existing SearXNG and Crawl4AI services. The service source is implemented and locally unit-tested, but it is **not claimed as live until the VPS deployment is completed and observed against real source changes**.

SearXNG is discovery, not truth. Product claims should resolve to first-party sources such as official changelogs, docs, pricing pages, GitHub releases or policy pages wherever possible.

### Trust defaults

- a first crawl creates a baseline, never a fake change
- unchanged normalized content is ignored
- obvious low-materiality diffs are rejected before LLM review
- broad SearXNG discovery cannot auto-add a monitored source or publish a signal
- `AUTO_PUBLISH=false` by default
- published signals and snapshots are append-only history
- crawler targets are restricted to public HTTP(S) URLs before Crawl4AI is called

## Product principles

- **Materiality before volume.** Cosmetic release noise should disappear.
- **Evidence is part of the UI.** A summary without the source is incomplete.
- **Changes are append-only history.** Tool dossiers accumulate state instead of replacing the past.
- **No pseudo-precise universal score.** Impact and consequence are more useful than a floating 9.2/10.
- **Personal relevance without an account.** Watchlist and last-visit state stay browser-local for the first version.

## Current implementation

- React + TypeScript + Vite frontend
- Static baseline catalog in `src/data/tools.json`
- Verified seed changes in `src/data/signals.ts`
- Browser-local watchlist + last-visit timestamp
- FastAPI + PostgreSQL intelligence service source in `services/intelligence/`
- source snapshots, hash-based change detection, unified diffs and materiality classification
- optional OpenAI-compatible structured editorial reviewer
- SearXNG candidate discovery and Crawl4AI first-party source capture adapters
- Vercel frontend preview deployment

## Frontend development

```bash
npm install
npm run dev
npm run check
npm run build
```

## Intelligence service development

```bash
cd services/intelligence
python -m unittest discover -s tests -v
python -m app.worker --once
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

See [`services/intelligence/README.md`](services/intelligence/README.md) and [`.env.intelligence.example`](.env.intelligence.example) before deployment.
