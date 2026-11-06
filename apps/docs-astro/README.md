# ClawQL docs (Astro)

Static Astro rebuild of **[docs.clawql.com](https://docs.clawql.com)** per [ADR 0018](../../docs/adr/0018-public-sites-astro-console-next.md).

**No Next.js / OpenNext / RSC flight URLs** — `output: 'static'`. Production serves Worker Assets (`clawql-docs-astro`); Pages project `clawql-docs-astro` is available at [clawql-docs-astro.pages.dev](https://clawql-docs-astro.pages.dev/) for previews.

Legacy Next Worker package: [`apps/docs`](../docs/) (no longer the live origin).

## Dev

```bash
cd apps/docs-astro
npm install
npm run import:next   # refresh MDX from apps/docs (optional; also runs on prebuild)
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Build / deploy

```bash
npm run build      # import-from-next + astro build → dist/
npm run preview
npm run deploy     # wrangler deploy → Worker clawql-docs-astro
```

One-shot with domain/route attach:

```bash
# CLOUDFLARE_API_TOKEN (+ optional CLOUDFLARE_ACCOUNT_ID)
./scripts/deploy/deploy-docs-to-cloudflare.sh
```

CI: [`.github/workflows/deploy-docs.yml`](../../.github/workflows/deploy-docs.yml) on pushes that touch `apps/docs-astro/**` (and imported `apps/docs` content paths).

**Why Worker Assets (not Pages custom domain)?** The deploy token has Workers + Pages write but not Zone DNS Edit. Workers custom domains/routes reuse the existing `docs.clawql.com` binding without creating a Pages CNAME. When DNS Edit is available, Pages custom domain can be attached; until then `*.pages.dev` remains the Pages preview URL.

## Content pipeline

`scripts/import-from-next.mjs` pulls:

- `apps/docs/src/app/**/page.mdx`
- `apps/docs/src/generated/*-body.mdx` (+ plugins + security-training bodies)
- Writes `src/content/docs/**/*.mdx` and `src/lib/nav.generated.json`

Hub JSX (`Note`, `Button`, registry explorers) is stripped to prose for the first cutover. FlexSearch / React islands can land after DNS flip.

## Related

- [Migration plan](../../docs/website/public-sites-astro-migration.md)
- Interim RSC WAF guard on the retired Next Worker is no longer required for docs origin
