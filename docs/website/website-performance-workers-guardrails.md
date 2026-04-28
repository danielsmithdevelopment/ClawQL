# Website performance, WCAG, SEO, and Cloudflare Workers guardrails

This document ties together **local/CI checks** (Lighthouse), **WCAG-oriented** front-end patterns, **SEO** hygiene, and **operational** steps to reduce repeats of **Worker resource exhaustion** (e.g. **Error 1102**) and related **`waitUntil()` cancellation** warnings on `docs.clawql.com`.

---

## What went wrong (incident pattern)

1. **HTTP 1102 — Worker exceeded resource limits** on `docs.clawql.com` (edge).
2. **Observability:** many **`waitUntil() tasks did not complete…`** warnings — background work scheduled after the response is returned is **cancelled** when it exceeds the platform time budget.
3. **Symptoms:** long MDX **case study** routes especially painful (large HTML + images + hydration).

Root cause class: **too much work per invocation** on **Workers** (CPU / lifetime), compounded by **post-response** tasks from **Next.js + OpenNext**, not a single missing `await` in app code.

---

## CI: Lighthouse (GitHub Actions)

Workflow: **[`.github/workflows/website-lighthouse.yml`](../.github/workflows/website-lighthouse.yml)**

- Builds **`website/`** with **`npm run build`**, serves **`next start`**, runs **Lighthouse** (desktop preset) against **`http://127.0.0.1:3000/`**.
- Asserts minimum scores via **[`scripts/dev/assert-lighthouse-scores.mjs`](../scripts/dev/assert-lighthouse-scores.mjs)** (defaults: performance **0.55**, accessibility **0.92**, SEO **0.9**, best practices **0.85** — tune with `LH_MIN_*` env vars in the workflow if needed).

### What Lighthouse CI **does** catch

- **Accessibility** regressions (contrast, names, landmarks, keyboard traps — lab only; not a WCAG audit certificate).
- **SEO** basics (meta, crawlability in the lab).
- **Best practices** (e.g. headers we set in `website/next.config.mjs`).
- **Client-side performance** signals (lab LCP/TBT/CLS on Node-served Next).

### What Lighthouse CI **does not** catch

- **Cloudflare Workers isolate CPU** limits, **`waitUntil`** budgets, or **production CDN** behavior.
- **Cold vs warm** cache at the edge.

**Follow-up (recommended):** add a **scheduled** job (weekly) running the same Lighthouse against **`https://docs.clawql.com/`** (production) with a **read-only** URL — optional secret not required for public site. That validates **headers + HTTP/2 + real TLS** without blocking PRs on prod flakiness.

---

## Local developer workflow

From **`website/`**:

```bash
npm ci
npm run lh:docs
```

Or a specific path after `npm run build && npm run start`:

```bash
npm run lh -- http://127.0.0.1:3000/case-studies/cloudflare-docs-mcp --preset=desktop --only-categories=performance,accessibility,best-practices,seo --view
```

**Flamegraphs / CPU:** Lighthouse is **browser-centric**. For **Worker** CPU, use **Cloudflare Observability** (invocations, logs), **Workers Logpush** (optional), and **dashboard** filters by route. Node-style **CPU flamegraphs** do not map 1:1 to the Workers runtime.

---

## Prevention checklist (repeat incidents)

### Product / runtime

- [ ] **Watch Observability** for **`waitUntil()`** warnings and **1102** spikes after every **large MDX** or **OpenNext** upgrade.
- [ ] **Cache strategy:** keep **`Cache-Control`** sensible (`website/next.config.mjs` + `public/_headers`); avoid unnecessary **purge-all** after deploy.
- [ ] **Plan limits:** confirm whether **Free vs Paid** Workers CPU limits are acceptable for **worst-case** case-study pages.
- [ ] **Upstream:** track **`@opennextjs/cloudflare`** and **Next.js** releases for Worker **`waitUntil` / `after()`** fixes.

### Content / front-end (reduces per-invocation cost)

- [ ] Prefer **concise** case studies or **split** very long narratives; fewer **above-the-fold** images per page.
- [ ] Ensure markdown images have **meaningful `alt`** (WCAG); default **`loading="lazy"`** is set in **`website/src/components/mdx.tsx`**.
- [ ] After large content changes, run **`npm run lh:docs`** (or CI) and spot-check **LCP** on case study URLs.

### Accessibility (WCAG-oriented — lab + manual)

- [ ] **Skip link** and **`#main-content`** target (see `website/src/app/layout.tsx`, `Layout.tsx`).
- [ ] **Landmarks / labels:** sidebar `aria-label="Documentation"`, header `aria-label="Site"`.
- [ ] **Focus visible** on primary controls (`Button` focus-visible ring).
- [ ] **Manual:** keyboard-only navigation, **200% zoom**, screen reader smoke on **search** dialog and **mobile nav**.

### SEO

- [ ] **Sitemap** stays **static** (`export const dynamic = 'force-static'` in `website/src/app/sitemap.ts`) — avoid fake **`lastModified: new Date()`** on every build.
- [ ] **Canonical + `docsPageMetadata`** per page (`website/src/lib/seo.ts`).
- [ ] **Structured data** in `SiteStructuredData` — extend only when schema is accurate.

### Security / best practices (Lighthouse “Best practices”)

- [ ] **`Referrer-Policy`** and **`X-Content-Type-Options`** on HTML routes (`website/next.config.mjs`).
- [ ] **`rel="noopener noreferrer"`** on external `https://` links in nav/header.

---

## Deploy reminder

Production deploy path: **[`scripts/deploy/deploy-docs-to-cloudflare.sh`](../scripts/deploy/deploy-docs-to-cloudflare.sh)** (Worker + **Workers Domains** attach). After **performance-related** changes, redeploy and re-check **Observability** for 24h.

---

## Additional improvements (backlog)

Pick up in issues or small PRs; not all are automated today.

| Idea                                                                    | Why it helps                                                                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scheduled Lighthouse on production** (`https://docs.clawql.com/`)     | Catches **TLS / HTTP / CDN** regressions lab CI misses; keep **assertions looser** than PR job to avoid noise.                                |
| **Synthetic checks** for `/`, `/api/health`, and **one case-study URL** | Early warning when **1102** or **5xx** spikes; see [`schedule-synthetic-checks.md`](schedule-synthetic-checks.md).                            |
| **Workers Logpush** or long-retention Observability                     | Correlates **Ray ID**, route, and **CPU** when users report failures.                                                                         |
| **`@next/bundle-analyzer`** (ad hoc)                                    | Finds **client JS bloat** (large RSC/hydration payloads).                                                                                     |
| **`eslint-plugin-jsx-a11y`** in `website/`                              | Catches **a11y** issues Lighthouse does not (e.g. some interactive patterns).                                                                 |
| **Route-level `dynamic` / caching hints**                               | If Next exposes stable static paths for some MDX, **reduce** Worker invocations (validate with OpenNext).                                     |
| **Image pipeline**                                                      | Prefer **`next/image`** with explicit **sizes** for hero assets; keep markdown bodies on **`loading="lazy"`** (already default in `mdx.tsx`). |
| **Paid Workers / higher CPU**                                           | Product decision when **case studies** are business-critical on **Free** limits.                                                              |
| **Content splits**                                                      | Long case studies → **multiple pages** or shorter “summary + deep link to GitHub” lowers **per-request** HTML and MDX compile cost.           |

---

## Related

- **Scripts index:** [`scripts/README.md`](../scripts/README.md)
- **Website package scripts:** [`website/README.md`](../website/README.md)
- **Caching:** [`website-caching.md`](website-caching.md)
- **Incident narrative (case study):** [`case_studies/docs-clawql-worker-1102-mcp-memory-2026-04.md`](case_studies/docs-clawql-worker-1102-mcp-memory-2026-04.md)
- **Incident notes (vault):** use **`memory_recall`** for `Incident: docs.clawql.com Error 1102` if ingested.
