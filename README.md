# should know — AI tools worth your time

A deliberately small, source-aware discovery website for AI products that improve a real workflow.

**Live:** deployed with Vercel  
**Scope:** 70 curated tools across design quality, software engineering, research, knowledge work, creative production, learning and specialist operations.

## What makes this different

- **Concrete jobs, not generic descriptions** — each card answers what the tool helps accomplish.
- **A caveat is mandatory** — recommendations include limits, setup cost or where human control still matters.
- **Source trail** — each entry links to an official product, documentation, release or evidence page.
- **Quality over one-shot generation** — the collection favors workflows with real components, evidence, testing, accessible design and controlled production.

## Local development

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
npm run check
```

## Data

`src/data/tools.json` contains the client-side, deployment-ready curation data. It is intentionally static: no user data, analytics, accounts or server-side database are required for the collection to work.

Editorial scores are research-fit scores, **not** market-share, vendor or performance claims. Product availability, pricing, free tiers and privacy conditions should be checked on the linked official page before adopting a tool.

## Stack

React · TypeScript · Vite · Vercel
