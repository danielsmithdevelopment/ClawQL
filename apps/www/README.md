# clawql.com (`apps/www`)

Marketing site for [ClawQL](https://github.com/danielsmithdevelopment/ClawQL). Live at [clawql.com](https://clawql.com). Docs stay in [`apps/docs/`](../docs/) ([docs.clawql.com](https://docs.clawql.com)).

Built with the [Tailwind Plus](https://tailwindcss.com/plus) Oatmeal kit (Tailwind CSS v4 + Elements). Unused kit copies (`pages/`, sibling `components/`) were removed; the Next app is this directory.

## Quick start

```bash
cd apps/www
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Site structure

| Route             | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `/`               | Homepage — MCP tool tiers, IDP pipeline, case studies, FAQs, pricing |
| `/signup`         | Managed accounts waitlist                                            |
| `/pricing`        | Full pricing tiers and comparison table                              |
| `/about`          | Mission and ecosystem overview                                       |
| `/privacy-policy` | Privacy policy                                                       |

## Key files

- `src/app/page.tsx` — Homepage content
- `src/app/layout.tsx` — Global nav, footer, metadata
- `src/lib/site.ts` — URLs, install command, shared copy constants
- `src/components/elements/clawql-logo.tsx` — Brand logo
- `public/ClawQL-logo.jpeg` — Logo asset (from `apps/dashboard/public/`)
- `functions/_middleware.ts` — Cloudflare Pages Link headers + markdown negotiation

## Content model

The site promotes plugin-bundle hosting models:

1. **Self-hosted (free)** — Open-source `clawql-mcp`; enable plugins via `CLAWQL_ENABLE_*`
2. **Gateway + memory** — Developer $29/mo, Teams $99/mo (unlimited MCP executions + vault + Onyx; no IDP)
3. **IDP plugin bundle** — Starter $299/mo, Business $599/mo, Professional $1,200/mo (document processing + VDR)
4. **Enterprise** — from $3,500/mo (dedicated node, custom fine-tune, Sovereign Security Pack included)

**Sovereign Security Pack** (+$200/mo on any paid tier) bundles Kata isolation, WORM Merkle audit, Panguard ATR.

Signup forms point to the waitlist flow (`/signup`). Wire `WaitlistSignupForm` to your backend when ready.

## Build & deploy

```bash
cd apps/www
npm run build
```

Next.js **static export** (`output: 'export'`). Production output is `apps/www/out/`.

Signup forms POST to **hello@clawql.com** via [FormSubmit](https://formsubmit.co). For local dev, set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so the post-submit redirect lands on `/signup/thanks/`.

### Deploy on merge to `main`

Workflow [`.github/workflows/deploy-landing-page.yml`](../../.github/workflows/deploy-landing-page.yml) builds `apps/www` and deploys to **GitHub Pages** on every push to `main` that touches `apps/www/**`.

**Agent readiness:** Prebuild writes `robots.txt`, `sitemap.xml`, `auth.md`, `/.well-known/*` (MCP/A2A/OAuth/API catalog/skills/payments), `llms.txt`, and `agent-markdown.json` into the static export.

**Critical Pages quirk:** `actions/upload-pages-artifact` defaults to **excluding hidden paths**. The deploy workflow sets `include-hidden-files: true` so `/.well-known` and `.nojekyll` actually ship.

**Lighthouse CI:** [`.github/workflows/landing-page-lighthouse.yml`](../../.github/workflows/landing-page-lighthouse.yml) asserts accessibility, SEO, and best-practices scores of 1.0 on the static export.

### Cloudflare Pages (for full agent score)

When `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, the same workflow also deploys to **Cloudflare Pages** (`clawql-website`). CI runs [`scripts/deploy/ensure-cloudflare-pages-project.sh`](../../scripts/deploy/ensure-cloudflare-pages-project.sh) before the first deploy so the project is created when missing. Opt out with repo variable **`LANDING_PAGE_CLOUDFLARE_DEPLOY=false`**. Wrangler runs from `apps/www/` so sibling `functions/` is bundled with `out/`.

**DNS (one-time, when switching):** Attach custom domain `clawql.com` to the Pages project in the Cloudflare dashboard (preferred path to level 5 on [isitagentready.com](https://isitagentready.com/clawql.com)).

CI also runs `scripts/deploy/ensure-clawql-com-agent-edge.sh`. Details: [`docs/deployment/dns-aid-clawql-com.md`](../../docs/deployment/dns-aid-clawql-com.md).

### Staying on GitHub Pages with Cloudflare DNS?

Pure GitHub Pages **cannot** pass **Link headers** or **Markdown for Agents** checks. Keep GH Pages as origin only if the apex is **proxied** through Cloudflare. Static `.well-known` files work on either host once hidden files are included in the Pages artifact.

`public/CNAME` remains `clawql.com`. `out/` can also be served from any static host (`npx serve out` after build).

## License

- **ClawQL content and customizations:** Apache 2.0 / MIT (same as the ClawQL repo)
- **Oatmeal template components:** [Tailwind Plus license](https://tailwindcss.com/plus/license) (`LICENSE.md`)

## Learn more

- [ClawQL README](../../README.md)
- [MCP tools reference](https://docs.clawql.com/tools)
- [Getting started](https://docs.clawql.com/getting-started)
