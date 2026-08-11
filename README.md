# should know — AI tools worth your time

A deliberately small, source-aware discovery site for AI products that improve a real workflow instead of a generic tool directory.

## Status

`shouldknow-ai` is a client-side MVP with a static editorial catalog. The current data file contains **70 tools across 10 categories**. An anonymous public deployment was verified at:

**https://shouldknow-ai.vercel.app**

The page responded with HTTP 200 and the title `Should Know — AI tools worth your time`.

## Implemented scope

- Search the catalog by tool name, job, reason, or category.
- Filter by category and sort by score, name, or catalog order/newness.
- Open a detail modal with the job, rationale, caveat, score, official product link, and source trail.
- Save picks in the browser with `localStorage`.
- Choose a random tool with **Surprise me**.
- Keep the catalog in `src/data/tools.json` with fields for product URL, category, job, rationale, caveat, score, and evidence URL.

## Planned / not implemented

There is no backend or account system in the repository. User accounts, cross-device saved lists, submissions, collaborative editing, server-side search, analytics, and automated verification of vendor claims are not implemented. Editorial scores are research-fit judgements, not vendor, market-share, or performance guarantees.

## Stack

- React and React DOM.
- TypeScript.
- Vite with `@vitejs/plugin-react`.
- `lucide-react` for icons.
- Vercel deployment configuration in `vercel.json` (`npm run build`, output directory `dist`).

The repository has a lockfile; package versions should be taken from `package-lock.json` rather than inferred from this overview.

## Setup and use

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. For a production-style local check:

```bash
npm run build
npm run preview
```

The type-check command is:

```bash
npm run check
```

No environment variables or server-side services are required for the catalog itself.

## Limitations

- The catalog is bundled into the frontend; updates require changing and redeploying the repository.
- Saved items are local to one browser and are not an account-backed collection.
- Product availability, pricing, privacy terms, and the linked evidence should be checked independently before adoption.
- No claim is made here that the anonymous deployment is identical to a particular commit beyond the live page check above.
