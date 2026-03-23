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

## Code style

- TypeScript in `src/`; run `npm run build` before submitting.
- Run `npm test` / `bun test src` as appropriate.
