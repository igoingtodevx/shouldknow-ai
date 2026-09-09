# Should Know intelligence architecture

## Goal

Turn a changing market into a small evidence-backed feed, not a giant directory.

```text
SearXNG discovery ─┐
Known source URLs ─┼─> candidate URLs
GitHub releases ───┘        │
                            v
                        Crawl4AI
                            │
                            v
                    normalized snapshot
                            │
                 ┌──────────┴──────────┐
                 │                     │
           previous snapshot      first snapshot
                 │                     │
                 v                     v
            semantic diff         baseline only
                 │
                 v
          materiality classifier
                 │
       ┌─────────┼──────────┐
       │         │          │
      P0        P1         P2
   publish    review       drop
       │         │
       └────┬────┘
            v
      source verification
            │
            v
        Should Know API
            │
            v
   Today / Week / Dossier / Watchlist
```

## Data model

### tools
Stable product identity and editorial metadata.

- `id`
- `name`
- `canonical_url`
- `category`
- `status`
- `editorial_verdict`
- assessment axes (`leverage`, `maturity`, `setup`, `control`, `price`, `privacy`, `evidence`)

### sources
Pages that can change independently.

- `id`
- `tool_id`
- `kind`: `homepage | docs | changelog | pricing | github | policy | blog`
- `url`
- `first_party`
- `crawl_frequency_minutes`
- `enabled`

### snapshots
Immutable captures.

- `id`
- `source_id`
- `captured_at`
- `content_hash`
- `normalized_text`
- `raw_artifact_ref`
- `http_status`

### changes
A diff between snapshots.

- `id`
- `source_id`
- `before_snapshot_id`
- `after_snapshot_id`
- `detected_at`
- `diff_text`
- `change_kind`
- `materiality`
- `confidence`
- `summary`
- `why_it_matters`
- `publication_status`

### evidence
Links and captures used to support a signal.

- `change_id`
- `url`
- `label`
- `first_party`
- `captured_at`
- `quote_or_diff_ref`

## Materiality

The classifier should optimize for false negatives over feed pollution only up to the point where important changes are still caught. The public feed must stay narrow.

Suggested deterministic pre-rules before any model call:

- pricing/plan/limit tokens changed -> at least review;
- removed/deprecated/shutdown/breaking -> P0 candidate;
- API/model/availability/integration terms changed -> P0/P1 candidate;
- only navigation/CSS/legal boilerplate hash changed -> likely P2;
- no meaningful normalized-text delta -> drop without LLM.

A model can then classify ambiguous diffs, but must receive the diff plus source metadata, never an unconstrained marketing page.

## Evidence policy

Discovery is not verification.

Community posts, search results and social sources can produce candidate URLs. Claims shown publicly should be verified against first-party evidence wherever available. If only secondary evidence exists, the UI must say so.

## Watchlist and retention

V1 keeps user state local:

- `shouldknow-watchlist`
- `shouldknow-last-visit`

No account is needed for the first product version. Later, optional sync can be added without making login a prerequisite.

## Deployment target

Frontend: Vercel.

VPS:

```text
shouldknow-api
shouldknow-worker
postgres
searxng          # existing service
crawl4ai         # existing service
```

The worker owns scheduled discovery/crawls. The API exposes read-only public data plus optional admin/review endpoints behind authentication.

## Rollout

1. Approve product UX with prototype signals.
2. Connect a 20–30 product watchset.
3. Capture baselines without publishing.
4. Run diffs for several days and inspect P0/P1/P2 quality.
5. Only then enable automatic public publication for high-confidence cases.
6. Add broad discovery after the known-product change engine is trustworthy.

Broad discovery before threshold tuning recreates the exact directory/noise problem this product is meant to solve.
