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

## Production deploy (docs.clawql.com)

The site is **OpenNext** on a Cloudflare **Worker** (`clawql-docs`); the custom domain is **https://docs.clawql.com**. Background: [issue #87](https://github.com/danielsmithdevelopment/ClawQL/issues/87).

**Local one-shot** (with [`wrangler` login](https://developers.cloudflare.com/workers/wrangler/commands/#login) or `CLOUDFLARE_API_TOKEN` in the environment):

```bash
cd website
export NEXT_PUBLIC_SITE_URL=https://docs.clawql.com
npm run deploy
```

**CI (automatic):** on push to `main` that changes **`website/**`**, **`.github/workflows/deploy-docs.yml` runs `npm run deploy`**. Configure repository **Secrets** (Settings → Secrets and variables → Actions):

- **`CLOUDFLARE_API_TOKEN`** — **required**. Create a [Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with **Account** / **Cloudflare Workers** (Edit) or equivalent to deploy the Worker. Wrangler will use it instead of a stored OAuth session.
- **`CLOUDFLARE_ACCOUNT_ID`** — **optional**; **`wrangler.jsonc` already sets** `account_id` for the docs Worker. You only need this **secret** if you override the account in CI. **Account-scoped** API tokens (e.g. the “Edit Cloudflare Workers” template) cannot call the user **/memberships** API, so wrangler must know the account (via **`account_id` in `wrangler.jsonc`** or this env) or deploy fails with error **9106** on `/memberships`.

**Troubleshooting (CI):** if Wrangler reports **“Cannot use the access token from location” (API error 9109)**, the token is **IP-restricted**. GitHub-hosted runners use **dynamic** IPs, so the token used in Actions must **not** be limited to specific client IP addresses. Use an unrestricted token for this secret (or a self-hosted runner in an allowlisted range).

**Manual run from GitHub:** Actions → “Deploy docs (Cloudflare)” → “Run workflow”.
