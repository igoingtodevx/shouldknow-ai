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
