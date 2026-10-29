# ClawQL docs (Astro)

Static Astro rebuild of **[docs.clawql.com](https://docs.clawql.com)** per [ADR 0018](../../docs/adr/0018-public-sites-astro-console-next.md).

**No Next.js / OpenNext / RSC flight URLs** — `output: 'static'` for Cloudflare Pages (or any static host).

Until DNS cutover, production may still point at [`apps/docs`](../docs/) (Next Worker). This package is the cutover target.

## Dev

```bash
cd apps/docs-astro
npm install
npm run import:next   # refresh MDX from apps/docs (optional; also runs on prebuild)
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Build

```bash
npm run build    # import-from-next + astro build → dist/
npm run preview
```

Cloudflare Pages: root `apps/docs-astro`, build `npm run build`, output `dist`.

## Content pipeline

`scripts/import-from-next.mjs` pulls:

- `apps/docs/src/app/**/page.mdx`
- `apps/docs/src/generated/*-body.mdx` (+ plugins + security-training bodies)
- Writes `src/content/docs/**/*.mdx` and `src/lib/nav.generated.json`

Hub JSX (`Note`, `Button`, registry explorers) is stripped to prose for the first cutover. FlexSearch / React islands can land after DNS flip.

## Related

- [Migration plan](../../docs/website/public-sites-astro-migration.md)
- Interim RSC WAF guard on the live Next Worker until cutover
