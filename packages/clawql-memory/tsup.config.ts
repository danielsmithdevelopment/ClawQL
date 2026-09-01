import { defineConfig } from "tsup";

const library = defineConfig({
  entry: {
    index: "src/index.ts",
    "vault/config": "src/vault/config.ts",
    "vault/utils": "src/vault/utils.ts",
    "vault/slug-index": "src/vault/slug-index.ts",
    "vault/provider-index": "src/vault/provider-index.ts",
    "okf/index": "src/okf/index.ts",
    "ingest/slug": "src/ingest/slug.ts",
    "ingest/hashes": "src/ingest/hashes.ts",
    "ingest/enterprise-citations": "src/ingest/enterprise-citations.ts",
    "ingest/ingest": "src/ingest/ingest.ts",
    "recall/pageindex-recall": "src/recall/pageindex-recall.ts",
    "recall/pageindex-enabled": "src/recall/pageindex-enabled.ts",
    "recall/codegraph-recall": "src/recall/codegraph-recall.ts",
    "recall/onyx-recall": "src/recall/onyx-recall.ts",
    "recall/recall-sources": "src/recall/recall-sources.ts",
    "recall/recall": "src/recall/recall.ts",
    "embedding/embedding": "src/embedding/embedding.ts",
    "db/artifacts": "src/db/artifacts.ts",
    "db/postgres-migrations": "src/db/postgres-migrations.ts",
    "db/memory-db": "src/db/memory-db.ts",
    "vector/pgvector": "src/vector/pgvector.ts",
    "plugin/index": "src/plugin/index.ts",
    "sync/vault-sync-hooks": "src/sync/vault-sync-hooks.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [/^clawql-/, "cbor", "debug", "express", "express-rate-limit"],
});

const cli = defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: false,
  banner: { js: "#!/usr/bin/env node" },
});

export default [library, cli];
