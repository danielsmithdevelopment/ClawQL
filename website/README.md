# ClawQL documentation site

Next.js + MDX site for [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) (`clawql-mcp`). Based on the Tailwind Plus Protocol template.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Global search (⌘K) indexes MDX pages via FlexSearch (`src/mdx/search.mjs`).

## Build

```bash
npm run build
npm start
```

## Performance, accessibility (WCAG-oriented), and SEO

- **Runbook (incident prevention, Lighthouse CI, Workers):** [`../docs/website-performance-workers-guardrails.md`](../docs/website-performance-workers-guardrails.md)
- **Local Lighthouse (needs local Chrome):** `npm run lh:docs` (writes `lighthouse-report.html`, gitignored)

GitHub Actions runs Lighthouse on **`next build` + `next start`** for PRs that touch **`website/`** — see **`.github/workflows/website-lighthouse.yml`** at the repo root.
