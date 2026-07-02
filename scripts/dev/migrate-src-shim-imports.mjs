#!/usr/bin/env node
/**
 * One-shot: rewrite src TypeScript imports from deprecated shims to workspace packages.
 */
import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {Array<[RegExp, string]>} */
const replacements = [
  [/from "\.\/spec-loader\.js"/g, 'from "clawql-api"'],
  [/from '\.\/spec-loader\.js'/g, "from 'clawql-api'"],
  [/from "\.\/spec-search\.js"/g, 'from "clawql-api"'],
  [/from "\.\/spec-kind\.js"/g, 'from "clawql-api"'],
  [/from "\.\/provider-registry\.js"/g, 'from "clawql-api"'],
  [/from "\.\/auth-headers\.js"/g, 'from "clawql-api"'],
  [/from "\.\/graphql-execute-helpers\.js"/g, 'from "clawql-api"'],
  [/from "\.\/graphql-in-process-execute\.js"/g, 'from "clawql-api"'],
  [/from "\.\/graphql-schema-builder\.js"/g, 'from "clawql-api"'],
  [/from "\.\/graphql-native-loader\.js"/g, 'from "clawql-api"'],
  [/from "\.\/grpc-native-loader\.js"/g, 'from "clawql-api"'],
  [/from "\.\/execute-native-grpc\.js"/g, 'from "clawql-api"'],
  [/from "\.\/execute-native-graphql\.js"/g, 'from "clawql-api"'],
  [/from "\.\/rest-operation\.js"/g, 'from "clawql-api"'],
  [/from "\.\/openapi-operations\.js"/g, 'from "clawql-api"'],
  [/from "\.\/operation-types\.js"/g, 'from "clawql-api"'],
  [/from "\.\/package-root\.js"/g, 'from "clawql-api"'],
  [/from "\.\/native-protocol-env\.js"/g, 'from "clawql-api"'],
  [/from "\.\/native-protocol-registry\.js"/g, 'from "clawql-api"'],
  [/from "\.\/native-protocol-merge\.js"/g, 'from "clawql-api"'],
  [/from "\.\/native-protocol-metrics\.js"/g, 'from "clawql-api"'],
  [/from "\.\/native-protocol-prometheus\.js"/g, 'from "clawql-api"'],
  [/from "\.\/clawql-optional-flags\.js"/g, 'from "clawql-api"'],
  [/from "\.\/memory-db\.js"/g, 'from "clawql-memory/db/memory-db"'],
  [/from "\.\/memory-db-artifact-cache\.js"/g, 'from "clawql-memory"'],
  [/from "\.\/memory-chunk\.js"/g, 'from "clawql-memory"'],
  [/from "\.\/memory-embedding\.js"/g, 'from "clawql-memory/embedding/embedding"'],
  [/from "\.\/memory-slug-index\.js"/g, 'from "clawql-memory/vault/slug-index"'],
  [/from "\.\/memory-provider-index\.js"/g, 'from "clawql-memory/vault/provider-index"'],
  [/from "\.\/memory-artifacts\.js"/g, 'from "clawql-memory/db/artifacts"'],
  [/from "\.\/memory-ingest-file\.js"/g, 'from "clawql-memory"'],
  [/from "\.\/enterprise-citations\.js"/g, 'from "clawql-memory/ingest/enterprise-citations"'],
  [/from "\.\/vault-utils\.js"/g, 'from "clawql-memory/vault/utils"'],
  [/from "\.\/vault-markdown\.js"/g, 'from "clawql-memory"'],
  [/from "\.\/vector-store\/pgvector\.js"/g, 'from "clawql-memory/vector/pgvector"'],
  [/from "\.\/memory-backends\/postgres-migrations\.js"/g, 'from "clawql-memory/db/postgres-migrations"'],
  [/from "\.\/external-ingest-url-format\.js"/g, 'from "clawql-documents/ingest/url-format"'],
];

const files = globSync("src/**/*.ts", { cwd: root });
let changed = 0;
for (const rel of files) {
  const abs = join(root, rel);
  let text = readFileSync(abs, "utf8");
  const before = text;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  if (text !== before) {
    writeFileSync(abs, text);
    changed += 1;
    console.log("updated", rel);
  }
}
console.log(`Done. ${changed} file(s) updated.`);
