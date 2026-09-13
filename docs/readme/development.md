# ClawQL Development Notes

This page captures contributor-oriented details that were previously in the root README.

## Local Development

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Build + start production mode:

```bash
npm run build && npm start
```

## Tests

```bash
npm test
npm run test:coverage
```

Vitest is used for tests; coverage output is written under `coverage/`.

## Extending MCP Tools

Core registration entrypoint:

- `src/mcp/tools.ts`

Related modules (MCP transport — **canonical logic in packages**):

- `clawql-memory/plugin` + `clawql-memory/ingest/*` / `recall/*`
- `src/host/vault-config.ts` (startup validation) → path resolution in `clawql-memory/vault/*`
- Sandbox: **`packages/clawql-sandbox/`** (`bridge-client.ts`, `container.ts`, `macos-seatbelt.ts`, plugin layer) — opt-in via `CLAWQL_ENABLE_SANDBOX=1`
- Ouroboros: **`packages/clawql-ouroboros/`** — Effect services + thin MCP plugin glue

## GraphQL Notes

Single-spec `execute` can use an internal OpenAPI-to-GraphQL path for response minimization for **OpenAPI/Discovery** operations.
In multi-spec mode, `execute` uses REST against the owning spec for those operations.
Native GraphQL / gRPC ops (see `packages/clawql-api/src/spec/native-protocol-merge.ts`, `src/mcp/tools.ts`) route to HTTP GraphQL or grpc-js instead.

Compatibility caveats:

- `docs/design/graphql-mesh-node-compatibility.md`
- `docs/design/OPENAPI_TO_GRAPHQL_UPSTREAM.md`

## Provider Maintenance

Maintainer helper commands:

```bash
npm run fetch-provider-specs
npm run pregenerate-graphql
```

Provider docs:

- `providers/README.md`
- `providers/google/apis/README.md`

## Publishing Checklist

1. Run tests and build.
2. Verify package metadata in `package.json`.
3. Never commit secrets (`.env` is local-only).
4. Keep `dist/` handling consistent with release workflow.
