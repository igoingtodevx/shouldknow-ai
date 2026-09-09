# Should Know — signal over volume

Should Know is evolving from a static AI-tool directory into a product-intelligence surface: a small feed of changes that are worth acting on, backed by first-party evidence and organised around a personal watchlist.

## Current branch architecture

The current product surface has three layers:

1. **Today** — a consequence-first change feed. Each signal carries impact, change type, why it matters, optional action/deadline and explicit evidence links.
2. **Watchlist** — browser-local product tracking. No account is required; the watchlist is stored locally and becomes the basis for “changes to my stack”.
3. **Library** — the original 70-tool catalog remains as a baseline discovery/watchset. The old 9.x score is deliberately no longer shown as if it were objective precision.

Selecting any product opens a **living dossier** that combines its old baseline context with captured change history and evidence sources.

## Verified seed feed

The branch ships with a deliberately small set of real, first-party-sourced changes so the product can be evaluated before an automated crawler is trusted. The seed feed is not presented as a live scanner.

Continuous collection is the next activation step.

## Planned intelligence engine

The intended production loop is:

```text
SearXNG / targeted source monitors
        ↓
possible change
        ↓
Crawl4AI extraction
        ↓
source snapshot
        ↓
previous ↔ current diff
        ↓
materiality filter
        ↓
first-party verification
        ↓
published change + evidence
        ↓
Today / Watchlist / Dossier
```

SearXNG is discovery, not truth. Product claims should resolve to first-party sources such as official changelogs, docs, pricing pages, GitHub releases or policy pages wherever possible.

## Product principles

- **Materiality before volume.** Cosmetic release noise should disappear.
- **Evidence is part of the UI.** A summary without the source is incomplete.
- **Changes are append-only history.** Tool dossiers accumulate state instead of replacing the past.
- **No pseudo-precise universal score.** Impact and consequence are more useful than a floating 9.2/10.
- **Personal relevance without an account.** Watchlist and last-visit state stay browser-local for the first version.

## Current implementation

- React + TypeScript + Vite
- Static baseline catalog in `src/data/tools.json`
- Verified seed changes in `src/data/signals.ts`
- Browser-local watchlist + last-visit timestamp
- Vercel frontend deployment

There is no crawler, database, server API or automated source-monitoring worker in this branch yet. Those belong to the intelligence-engine activation phase and must not be claimed as live until deployed and observed.

## Local development

```bash
npm install
npm run dev
npm run check
npm run build
```
