# GraphQL translation layer: upstream fixes (`@omnigraph/openapi` / GraphQL Mesh)

ClawQL builds an executable GraphQL schema from your OpenAPI document using
**[`@omnigraph/openapi`](https://www.npmjs.com/package/@omnigraph/openapi)** —
the same OpenAPI → GraphQL stack used by **[GraphQL Mesh’s OpenAPI handler](https://the-guild.dev/graphql/mesh/docs/handlers/openapi)** (The Guild).

Some **very large** specs (e.g. full Jira or Cloudflare OpenAPI) can still hit
translation edge cases inside **json-machete / graphql-compose** (dependencies
of Omnigraph). When that happens, ClawQL’s **`execute`** tool falls back to **REST**
using the same operation index.

## Contributing upstream

1. **Reproduce** with `npm run pregenerate-graphql` or a small script that calls
   `buildGraphQLSchema` in `src/graphql-schema-builder.ts` with your spec.
2. **Open an issue** (or PR) on the relevant project:
   - **[ardatan/graphql-mesh](https://github.com/ardatan/graphql-mesh)** — Mesh
     umbrella, OpenAPI handler docs.
   - Issues often land in **`@omnigraph/openapi`** / **`@omnigraph/json-schema`**
     packages (published from that monorepo).

Include: OpenAPI snippet or path, full error stack, ClawQL version.

## Historical note

Earlier versions of ClawQL used IBM’s **`openapi-to-graphql`**. That dependency
has been **replaced** by the Mesh / Omnigraph stack above.
