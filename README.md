# Should Know — AI product intelligence

Should Know is being rebuilt from a static AI-tool directory into an evidence-first signal layer for a fast-moving market.

The public product answers one question: **what changed in AI products that is actually worth knowing?**

## Current V1

The V1 branch introduces:

- a `Today` / `This week` signal feed instead of a ranked tool grid;
- local `My stack` watchlists with a `since your last visit` counter;
- living tool dossiers with explicit axes instead of pseudo-precise 9.x scores;
- visible evidence links and a materiality taxonomy (`P0`, `P1`, `P2`);
- a safe frontend switch from prototype data to reviewed live signals via `VITE_INTELLIGENCE_API`;
- a VPS intelligence engine for watchsets, normalized snapshots, diffs, materiality scoring, discovery candidates and a manual publication gate.

The legacy `src/data/tools.json` file is retained as seed inventory, not as the product's source of truth.

## Editorial contract

Should Know should publish only when a change is likely to alter a real workflow.

- **P0 — Should know:** pricing, major capability, breaking API, shutdown, data/privacy policy or genuinely new workflow.
- **P1 — Worth a look:** meaningful feature, integration, platform expansion or measurable workflow improvement.
- **P2 — Noise:** cosmetic UI polish, vague marketing, renamed features and low-signal release-note churn.

Discovery can be broad. Publication remains narrow.

## Evidence model

Search/community sources can discover a possible change, but first-party evidence should verify it wherever possible:

- official changelogs and release notes;
- documentation;
- pricing pages;
- official GitHub releases;
- vendor blogs;
- terms/privacy pages when relevant.

The VPS worker uses SearXNG for discovery and Crawl4AI for extraction. Normalized snapshots are stored before analysis, so a reviewed signal can retain the underlying before/after evidence instead of merely paraphrasing vendor copy.

## Publication safety

Automatic publication is hard-disabled in the current rollout. Detected P0/P1/ambiguous changes enter `review` state. Public API endpoints expose only `published` records.

An authenticated internal review API can inspect the normalized diff and explicitly publish, reject or keep a change in review. If `SHOULDKNOW_ADMIN_TOKEN` is absent, review mutation is disabled fail-closed.

## Development

```bash
npm install
npm run dev
npm run check
npm run build
```

The frontend remains React + TypeScript + Vite and is deployable on Vercel.

To consume the reviewed live feed, set this only in the frontend deployment environment:

```env
VITE_INTELLIGENCE_API=https://<public-read-api-host>
```

Do **not** expose `SHOULDKNOW_ADMIN_TOKEN` to Vite or any browser bundle.

If the live API is not configured or cannot be reached, the V1 frontend falls back to the clearly labelled prototype dataset rather than presenting seed data as live intelligence.

## Intelligence engine

See [`intelligence/README.md`](intelligence/README.md) and [`docs/INTELLIGENCE_ARCHITECTURE.md`](docs/INTELLIGENCE_ARCHITECTURE.md).

The branch has been exercised against the real VPS SearXNG, Crawl4AI and Postgres services in shadow mode. Repeated unchanged crawls were hash-stable after normalization fixes; no detected change is automatically public.

## Prototype-data warning

`src/data/signals.json` contains clearly marked demo signals used to validate the product UX before reviewed live signals are available. They are examples, not claims about current vendor changes.

## Live site

The existing static deployment is at <https://shouldknow-ai.vercel.app>. Branch previews should be used for the V1 redesign until it is reviewed and merged.
