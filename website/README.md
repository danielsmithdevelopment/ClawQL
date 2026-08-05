# ClawQL documentation site

Next.js + MDX site for [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) (`clawql-mcp`). Based on the Tailwind Plus Protocol template.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Global search (⌘K) indexes MDX via FlexSearch — `prebuild` emits lazy-loaded chunks in `public/search-index/` (`scripts/generate-search-index.mjs`, runtime in `src/mdx/search-runtime.ts`).

**In-page TOC:** pages with two or more `##` headings get an **On this page** nav (and left-sidebar section links). Section metadata is generated Workers-safely by `scripts/generate-doc-layout-sections.mjs` → `src/generated/doc-layout-sections.generated.ts` (wired into `prebuild` / `dev` after doc sync scripts). Only one TOC renders per page (claim guard in `OnThisPageProvider`).

**Caching:** HTML uses short edge TTLs (`edge-cache-control.mjs` / `public/_headers`) so prerendered pages cannot keep pointing at deleted `/_next/static/*.css` hashes after a deploy. Static assets remain immutable.

## Build

```bash
npm run build
npm start
```

## Canonical doc sources (do not edit generated MDX by hand)

**Product vision:** `docs/vision/clawql-vision-roadmap.md` → `/vision/roadmap` (**start here** — public edition). Master Architecture & Enablement Guide v2.1: `docs/vision/clawql-master-enablement-guide.md` → `/architecture` (unified index). Modularization v2.1 on `/architecture` is the package-boundary companion.

Long pages under `src/generated/` are copied from repo `docs/` at **prebuild** / **dev**:

| Site route                     | Source                                                                    | Sync script                                     |
| ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------- |
| `/vision/roadmap`              | `docs/vision/clawql-vision-roadmap.md` (**public edition — start here**)  | `scripts/sync-clawql-vision-roadmap-doc.mjs`    |
| `/contributing/technical-specification` | `docs/contributing/clawql-contributor-technical-specification.md` | `scripts/sync-clawql-contributor-technical-spec-doc.mjs` |
| `/deployment/operations-guide` | `docs/deployment/clawql-deployment-operations-guide.md` | `scripts/sync-clawql-deployment-operations-guide-doc.mjs` |
| `/ouroboros/daos` | `docs/ouroboros/daos-unified-architecture-specification-v2.7.md` | `scripts/sync-daos-unified-architecture-spec-doc.mjs` |
| `/ouroboros/specification` | `docs/ouroboros/daos-coordination-layer-specification.md` | `scripts/sync-daos-coordination-layer-spec-doc.mjs` |
| `/ouroboros/build-plan` | `docs/ouroboros/daos-build-plan-v2.7.1.md` | `scripts/sync-daos-build-plan-doc.mjs` |
| `/architecture/token-efficiency` | `docs/architecture/clawql-token-efficiency.md` | `scripts/sync-clawql-token-efficiency-doc.mjs` |
| `/architecture/enterprise-ontology` | `docs/architecture/enterprise-ontology.md` | `scripts/sync-enterprise-ontology-doc.mjs` |
| `/specs/cq-extensions` (+ `/cqe` `/cqm` `/cqk` `/cqw`) | `docs/specs/cq-extensions/*` | `scripts/sync-cq-extensions-docs.mjs` |
| `/architecture/agentic-fabric` | `docs/architecture/zero-trust-agentic-fabric.md` | `scripts/sync-zero-trust-agentic-fabric-doc.mjs` |
| `/inference/clawql-inference` | `docs/inference/clawql-inference.md` | `scripts/sync-clawql-inference-doc.mjs` |
| `/payments/clawql-payments` | `docs/payments/clawql-payments.md` | `scripts/sync-clawql-payments-doc.mjs` |
| `/surveillance/clawql-surveillance` | `docs/surveillance/clawql-surveillance.md` | `scripts/sync-clawql-surveillance-doc.mjs` |
| `/architecture` | `docs/vision/clawql-master-enablement-guide.md` (full technical reference)| `scripts/sync-clawql-master-enablement-doc.mjs` |
| `/architecture`       | `docs/vision/clawql-modularization-v2.md` (companion)                     | `scripts/sync-clawql-modularization-doc.mjs`    |
| `/vision/immutable-releases`   | `docs/vision/clawql-hybrid-decentralized-github-alternative.md` (Layer 0) | `scripts/sync-clawql-hybrid-decentralized-doc.mjs` |
| `/vision/slide-deck`           | `docs/presentations/clawql-slides.md`                                     | `scripts/sync-clawql-slides-doc.mjs`            |
| `/security/defense-in-depth`   | `docs/security/clawql-defense-in-depth-security-guide.md` (deployment reference) | `scripts/sync-clawql-defense-in-depth-doc.mjs`  |
| `/security/best-practices/*`   | `docs/security/security-best-practices-series/*.md`                       | `scripts/sync-security-training-modules.mjs`    |

Edit the **Markdown sources**, then run `npm run dev` or `npm run build` so generated fragments stay in sync.

## Performance, accessibility (WCAG-oriented), and SEO

- **Runbook (incident prevention, Lighthouse CI, Workers):** [`../docs/website/website-performance-workers-guardrails.md`](../docs/website/website-performance-workers-guardrails.md)
- **Crawlers & link previews:** Long-form generated MDX (e.g. `/vision/slide-deck`, `/security/defense-in-depth`) uses **synchronous** imports so the **full article body is in the HTML response** at build time. Avoid wrapping that MDX in `Suspense` + `import()` unless you accept that many bots and “paste URL” tools only read the first HTML chunk (often a loading placeholder).
- **Local Lighthouse** needs a **Chromium-based** binary. Lighthouse looks for **Google Chrome** by default; if you only have **Brave** (or another Chromium), set **`CHROME_PATH`** to the executable (macOS Brave: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`). Example against a local **`next start`**: `CHROME_PATH="…/Brave Browser" npx lighthouse@13.1.0 http://127.0.0.1:3000/ --preset=desktop --only-categories=performance,accessibility,best-practices,seo --view`. **`npm run lh:docs`** hits production and writes `lighthouse-report.html` (gitignored).

GitHub Actions runs Lighthouse on **`next build` + `next start`** for PRs that touch **`website/`** — see **`.github/workflows/website-lighthouse.yml`** at the repo root: **desktop** preset then **mobile form-factor** (Lighthouse 13+; mobile run uses a lower performance floor). CI sets **`LH_MIN_A11Y=1`** so the **accessibility category must score 100** in the lab (not a substitute for a full WCAG conformance audit, but it blocks common regressions), and **`LH_MIN_PERF=0.70`** for **desktop** performance (defaults in **`scripts/dev/assert-lighthouse-scores.mjs`**; override with env vars if a run is flaky). Root **`ci.yml`** also runs **`npm run test:smoke`** in **`website/`**, which includes **Playwright + axe** checks in **`tests/a11y-axe.spec.ts`**.

## Production deploy (docs.clawql.com)

The site is **OpenNext** on a Cloudflare **Worker** (`clawql-docs`); the custom domain is **https://docs.clawql.com**. Background: [issue #87](https://github.com/danielsmithdevelopment/ClawQL/issues/87).

**Local one-shot** (with [`wrangler` login](https://developers.cloudflare.com/workers/wrangler/commands/#login) or `CLOUDFLARE_API_TOKEN` in the environment):

```bash
cd website
export NEXT_PUBLIC_SITE_URL=https://docs.clawql.com
npm run deploy
```

**CI (automatic):** on push to `main` that changes **`website/**`**, **`.github/workflows/deploy-docs.yml`runs`npm run deploy`**. Configure repository **Secrets\*\* (Settings → Secrets and variables → Actions):

- **`CLOUDFLARE_API_TOKEN`** — **required**. Create a [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with **Account** / **Cloudflare Workers** (Edit) or equivalent to deploy the Worker. Wrangler will use it instead of a stored OAuth session.
- **`CLOUDFLARE_ACCOUNT_ID`** — **optional**; **`wrangler.jsonc` already sets** `account_id` for the docs Worker. You only need this **secret** if you override the account in CI. **Account-scoped** API tokens (e.g. the “Edit Cloudflare Workers” template) cannot call the user **/memberships** API, so wrangler must know the account (via **`account_id` in `wrangler.jsonc`** or this env) or deploy fails with error **9106** on `/memberships`.

**Troubleshooting (CI):** if Wrangler reports **“Cannot use the access token from location” (API error 9109)**, the token is **IP-restricted**. GitHub-hosted runners use **dynamic** IPs, so the token used in Actions must **not** be limited to specific client IP addresses. Use an unrestricted token for this secret (or a self-hosted runner in an allowlisted range).

**Manual run from GitHub:** Actions → “Deploy docs (Cloudflare)” → “Run workflow”.
