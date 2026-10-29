# ClawQL docs (Astro)

Migration target for **[docs.clawql.com](https://docs.clawql.com)** per [ADR 0018](../../docs/adr/0018-public-sites-astro-console-next.md).

**Production today** is still [`apps/docs`](../docs/) (Next.js + OpenNext Workers). This package is the static Astro replacement — no RSC flight URLs, Cloudflare Pages / static assets friendly.

## Dev

```bash
cd apps/docs-astro
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

## Build

```bash
npm run build    # → dist/
npm run preview
```

Cloudflare Pages: build command `npm run build`, output directory `dist`, root `apps/docs-astro` (or filter accordingly).

## Porting content

1. Add MDX under `src/content/docs/` with `title` + `description` frontmatter.
2. Extend `src/lib/nav.ts` sidebar links.
3. Prefer relative links for pages that already live here; keep absolute `https://docs.clawql.com/...` for not-yet-ported routes.

See [public-sites-astro-migration.md](../../docs/website/public-sites-astro-migration.md).
