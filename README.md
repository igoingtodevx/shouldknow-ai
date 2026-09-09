# Should Know — AI product intelligence

Should Know is being rebuilt from a static AI-tool directory into an evidence-first signal layer for a fast-moving market.

The public product answers one question: **what changed in AI products that is actually worth knowing?**

## Current V1

The V1 branch introduces:

- a `Today` / `This week` signal feed instead of a ranked tool grid;
- local `My stack` watchlists with a `since your last visit` counter;
- living tool dossiers with explicit axes instead of pseudo-precise 9.x scores;
- visible evidence links and a materiality taxonomy (`P0`, `P1`, `P2`);
- a deliberately labelled prototype dataset until the live crawler is connected;
- an intelligence-engine scaffold for watchsets, snapshots, diffs and materiality scoring.

The legacy `src/data/tools.json` file is retained as seed inventory, not as the product's source of truth.

## Editorial contract

Should Know should publish only when a change is likely to alter a real workflow.

- **P0 — Should know:** pricing, major capability, breaking API, shutdown, data/privacy policy or genuinely new workflow.
- **P1 — Worth a look:** meaningful feature, integration, platform expansion or measurable workflow improvement.
- **P2 — Noise:** cosmetic UI polish, vague marketing, renamed features and low-signal release-note churn.

Discovery can be broad. Publication should remain narrow.

## Evidence model

Search/community sources can discover a possible change, but first-party evidence should verify it wherever possible:

- official changelogs and release notes;
- documentation;
- pricing pages;
- official GitHub releases;
- vendor blogs;
- terms/privacy pages when relevant.

The planned VPS worker uses SearXNG for discovery and Crawl4AI for extraction. Snapshots are stored before analysis so a public signal can eventually expose what actually changed rather than merely paraphrasing vendor copy.

## Development

```bash
npm install
npm run dev
npm run check
npm run build
```

The frontend remains React + TypeScript + Vite and is deployable on Vercel.

## Intelligence engine scaffold

See [`intelligence/README.md`](intelligence/README.md) and [`docs/INTELLIGENCE_ARCHITECTURE.md`](docs/INTELLIGENCE_ARCHITECTURE.md).

The scaffold intentionally does **not** claim that SearXNG/Crawl4AI are live from this repository. Those services will be connected on the VPS after the product surface and thresholds are approved.

## Prototype-data warning

`src/data/signals.json` contains clearly marked demo signals used to validate the product UX before a crawler is trusted to publish. They are examples, not claims about current vendor changes.

## Live site

The existing static deployment is at <https://shouldknow-ai.vercel.app>. Branch previews should be used for the V1 redesign until it is reviewed and merged.
