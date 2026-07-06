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
2. **Gateway + memory** — Developer $29/mo, Teams $99/mo (MCP executions + vault + Onyx; no IDP)
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

### GitHub Pages (on merge to `main`)

A workflow at [`.github/workflows/deploy-landing-page.yml`](../.github/workflows/deploy-landing-page.yml) builds and deploys when `landing-page/**` changes.

**One-time repo setup:**

1. **Settings → Pages → Build and deployment** — set **Source** to **GitHub Actions**.
2. **Custom domain** — `public/CNAME` is set to `clawql.com`. Point DNS at GitHub Pages ([docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)):
   - Apex `clawql.com`: A records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Or `www`: CNAME → `<user>.github.io`
3. Enable **Enforce HTTPS** after DNS propagates.

**Without a custom domain** (project site at `https://<org>.github.io/ClawQL/`): add repository variable `LANDING_PAGE_BASE_PATH` = `/ClawQL` and remove or change `public/CNAME`.

### Other hosts

`out/` can also be served from any static host, or run locally with `npx serve out` after build.

## License

- **ClawQL content and customizations:** Apache 2.0 / MIT (same as the ClawQL repo)
- **Oatmeal template components:** [Tailwind Plus license](https://tailwindcss.com/plus/license)

## Learn more

- [ClawQL README](../README.md)
- [MCP tools reference](https://docs.clawql.com/mcp/mcp-tools)
- [Getting started](https://docs.clawql.com/readme/getting-started)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Elements](https://tailwindcss.com/plus/ui-blocks/documentation/elements)
