# Contributing

Thanks for helping improve ClawQL.

## Issues & PRs

- **Bugs / features** in this repo: open a GitHub issue or PR with a short
  description and, when possible, a minimal repro (env vars, spec snippet).

## GraphQL translation (`@omnigraph/openapi` / GraphQL Mesh)

Some **large OpenAPI** documents fail inside **`@omnigraph/openapi`** (same stack
as [GraphQL Mesh OpenAPI](https://the-guild.dev/graphql/mesh/docs/handlers/openapi)).
ClawQL uses **REST fallback** when that happens, but we want **upstream fixes**.

See **[`docs/OPENAPI_TO_GRAPHQL_UPSTREAM.md`](docs/OPENAPI_TO_GRAPHQL_UPSTREAM.md)** for
where to report issues (GraphQL Mesh / Omnigraph monorepo) and how to reproduce.

## Bundled API specs (`providers/`)

- New **single** OpenAPI/Discovery providers: add under `providers/<vendor>/`, register in **`src/provider-registry.ts`** (`BUNDLED_PROVIDERS`), extend **`scripts/fetch-provider-specs.mjs`** if the spec is fetched from a URL, and document in **`providers/README.md`**.
- The merged preset **`all-providers`** includes **Google top50** plus every `BUNDLED_PROVIDERS` entry **except** the standalone `google` discovery file — no extra list to maintain when adding vendors.

## Code style

- TypeScript in `src/`; after `npm install` from a **git checkout**, run **`npm run build`** once (the published npm package ships `dist/`; only clones need a local compile).
- Before submitting: **`npm run lint`**, **`npm run format:check`** (or **`npm run format`** to apply Prettier), and **`npm test`** (Vitest). Root **`format`** / **`format:check`** also runs Prettier on **`website/`** (`*.ts`, `mdx-components.tsx`, `src/**/*.{mdx,ts,tsx}`) using **`website/prettier.config.js`** (Tailwind class order + organize-imports). CI runs the same checks plus coverage (**`npx vitest run --coverage`**); **ShellCheck** and **actionlint** share one job; the **Node matrix** runs only after lint + scripts pass, with **fail-fast** on the matrix. See **`.github/workflows/`**.
- Maintainer **GraphQL pregenerate** scripts (`pregenerate-graphql`, `pregenerate-google-top50-graphql`) run with **`tsx`** (devDependency), same as **`npm run dev`** — no Bun required.
