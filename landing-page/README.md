# ClawQL landing page

Marketing site for [ClawQL](https://github.com/danielsmithdevelopment/ClawQL) — MCP server for API discovery and execution. Built with the [Tailwind Plus](https://tailwindcss.com/plus) Oatmeal template (Tailwind CSS v4 + Elements), customized for ClawQL product content, managed account signups, and pricing.

**Live docs:** [docs.clawql.com](https://docs.clawql.com)

## Quick start

From the `demo/` directory:

```bash
cd landing-page/demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Site structure

| Route | Purpose |
| ----- | ------- |
| `/` | Homepage — MCP tool tiers, IDP pipeline, case studies, FAQs, pricing |
| `/signup` | Managed accounts waitlist |
| `/pricing` | Full pricing tiers and comparison table |
| `/about` | Mission and ecosystem overview |
| `/privacy-policy` | Privacy policy |

## Key files

- `demo/src/app/page.tsx` — Homepage content
- `demo/src/app/layout.tsx` — Global nav, footer, metadata
- `demo/src/lib/site.ts` — URLs, install command, shared copy constants
- `demo/src/components/elements/clawql-logo.tsx` — Brand logo component
- `demo/public/ClawQL-logo.jpeg` — Logo asset (from `dashboard/public/`)

## Content model

The site promotes plugin-bundle hosting models:

1. **Self-hosted (free)** — Open-source `clawql-mcp`; enable plugins via `CLAWQL_ENABLE_*`
2. **Gateway + memory** — Developer $29/mo, Teams $99/mo (unlimited MCP executions + vault + Onyx; no IDP)
3. **IDP plugin bundle** — Starter $299/mo, Business $599/mo, Professional $1,200/mo (document processing + VDR)
4. **Enterprise** — from $3,500/mo (dedicated node, custom fine-tune, Sovereign Security Pack included)

**Sovereign Security Pack** (+$200/mo on any paid tier) bundles Kata isolation, WORM Merkle audit, Panguard ATR.

Signup forms point to the waitlist flow (`/signup`). Wire `WaitlistSignupForm` to your backend when ready.

## Template origin

This site uses the Oatmeal Tailwind Plus SaaS Marketing Kit. Original template setup notes:

### Dependencies

```bash
npm install clsx @tailwindplus/elements@latest
```

### CSS theme

See `demo/src/app/globals.css` — mist color palette, Mona Sans + Inter fonts.

### Components

Reusable UI lives in `demo/src/components/` (elements, icons, sections). The parent `components/` directory holds the upstream template copies.

## Build & deploy

```bash
cd landing-page/demo
npm run build
```

The app uses Next.js **static export** (`output: 'export'`). Production output is written to `landing-page/demo/out/`.

Signup forms POST to **hello@clawql.com** via [FormSubmit](https://formsubmit.co) (works on static GitHub Pages — no backend).

**First-time activation:** submit a test signup once, then click the confirmation link FormSubmit emails to `hello@clawql.com`. After that, every footer or `/signup` submission forwards the fields (name, email, company, message) to your inbox.

For local dev, set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` so the post-submit redirect lands on `/signup/thanks/`.

### Deploy on merge to `main`

Workflow [`.github/workflows/deploy-landing-page.yml`](../.github/workflows/deploy-landing-page.yml) builds `landing-page/demo` and deploys to **GitHub Pages** on every push to `main` that touches `landing-page/**`.

**Agent readiness (GitHub Pages):** The prebuild step writes `robots.txt`, `sitemap.xml`, `auth.md`, `/.well-known/*`, `llms.txt`, and `agent-markdown.json` into the static export. These work on GitHub Pages. **Link** response headers and **Accept: text/markdown** negotiation require Cloudflare Pages `functions/` or edge rules (see below).

**Lighthouse CI:** [`.github/workflows/landing-page-lighthouse.yml`](../.github/workflows/landing-page-lighthouse.yml) asserts accessibility, SEO, and best-practices scores of 1.0 on the static export.

### Cloudflare Pages (optional, for full agent score)

When `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and repo variable **`LANDING_PAGE_CLOUDFLARE_DEPLOY=true`** are set, the same workflow also deploys to **Cloudflare Pages** (`clawql-website`). Wrangler runs from `landing-page/demo/` so the sibling `functions/` directory (Link headers + markdown negotiation) is bundled with `out/`.

**DNS (one-time, when switching):** Point apex `clawql.com` to Cloudflare Pages (not GitHub Pages A records). Attach custom domain `clawql.com` to the Pages project in the Cloudflare dashboard.

Optional CI step `scripts/deploy/ensure-dns-aid-records.sh` creates DNS-AID records when the Cloudflare token is set.

### Staying on GitHub Pages with Cloudflare DNS?

Pure GitHub Pages **cannot** pass **Link headers** or **Markdown for Agents** checks (no custom response headers or content negotiation). You can keep GitHub Pages as the origin if `clawql.com` stays on Cloudflare: enable **Markdown for Agents** on the zone and add a **Transform Rule** (or thin Worker) for `Link` headers. Static `.well-known` files and `robots.txt` work on either host.

### Legacy GitHub Pages

`public/CNAME` remains `clawql.com`. GitHub Pages is the default deploy target until Cloudflare API secrets are configured.

### Other hosts

`out/` can also be served from any static host, or run locally with `npx serve out` after build.

## License

- **ClawQL content and customizations:** Apache 2.0 / MIT (same as the ClawQL repo)
- **Oatmeal template components:** [Tailwind Plus license](https://tailwindcss.com/plus/license)

## Learn more

- [ClawQL README](../README.md)
- [MCP tools reference](https://docs.clawql.com/tools)
- [Getting started](https://docs.clawql.com/getting-started)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Elements](https://tailwindcss.com/plus/ui-blocks/documentation/elements)
