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

- TypeScript in `src/`; run `npm run build` before submitting.
- Run `npm test` / `bun test src` as appropriate.
