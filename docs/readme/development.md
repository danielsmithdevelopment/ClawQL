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

- `src/tools.ts`

Related modules:

- `src/memory-ingest.ts`
- `src/memory-recall.ts`
- `src/sandbox-bridge-client.ts`
- `src/vault-config.ts`
- `src/vault-utils.ts`

## GraphQL Notes

Single-spec `execute` can use an internal OpenAPI-to-GraphQL path for response minimization for **OpenAPI/Discovery** operations.
In multi-spec mode, `execute` uses REST against the owning spec for those operations.
Native GraphQL / gRPC ops (see `src/native-protocol-merge.ts`, `src/tools.ts`) route to HTTP GraphQL or grpc-js instead.

Compatibility caveats:

- `docs/graphql-mesh-node-compatibility.md`
- `docs/OPENAPI_TO_GRAPHQL_UPSTREAM.md`

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
