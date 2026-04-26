# Cloud Run MCP + GraphQL smoke (2026-03-19)

**Original:** repo-root `TEST_RESULTS_2026-03-19.md` (full curl output and notes). Use git history for the complete transcript.

**Scope (summary):** validated GraphQL proxy health, parsed-spec operation lookup for Cloud Run, and live GraphQL execution against a **list services**-style call against Cloud Run.

**How it was run (historical):**

- GraphQL proxy: **`npm run graphql`** (port **4000** in that run; historical note)
- MCP server: `node --import tsx src/server.ts`

**Current entrypoints:** see [`README.md`](../../../README.md) (**Setup** / GraphQL) and [`docs/deployment/deploy-cloud-run.md`](../../deployment/deploy-cloud-run.md) for production-style serving.
