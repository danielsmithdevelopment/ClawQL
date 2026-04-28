# Linear (GraphQL-only)

ClawQL bundles **[`schema.graphql`](schema.graphql)** from Linear’s open-source SDK (`linear/linear`, MIT):

`packages/sdk/src/schema.graphql` — same file **`npm run fetch-linear-schema`** downloads.

- **HTTP endpoint:** `https://api.linear.app/graphql` (see **`BUNDLED_PROVIDERS.linear`** in `src/provider-registry.ts`).
- **Auth:** API key in the `Authorization` header **without** a `Bearer` prefix — set **`LINEAR_API_KEY`** or **`CLAWQL_LINEAR_API_KEY`** (see **`src/auth-headers.ts`**).
- **Usage:** `CLAWQL_PROVIDER=linear`, or include **`linear`** in **`CLAWQL_BUNDLED_PROVIDERS`** / **`all-providers`**. Operations are native GraphQL (`search` / `execute`); there is no REST OpenAPI document.

Refresh the SDL after upstream schema changes:

```bash
npm run fetch-linear-schema
```
