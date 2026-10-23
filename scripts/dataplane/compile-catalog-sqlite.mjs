#!/usr/bin/env node
/**
 * Compile OpenAPI → production catalog.sqlite (same schema as
 * packages/clawql-api/src/catalog/catalog-sqlite.ts).
 *
 *   node scripts/dataplane/compile-catalog-sqlite.mjs \
 *     --spec scripts/dataplane/fixtures/cloudflare-curated-openapi.json \
 *     --out scripts/dataplane/fixtures/cloudflare-curated.catalog.sqlite
 *
 * Prefers clawql-api `writeCatalogSqlite` when present in dist; otherwise
 * writes the schema with node:sqlite (identical layout).
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const specPath = resolve(arg("--spec", process.env.CLAWQL_SPEC_PATH || ""));
const outPath = resolve(
  arg("--out", process.env.CLAWQL_CATALOG_SQLITE_PATH || process.env.CLAWQL_DATAPLANE_CATALOG || "")
);
if (!specPath || !outPath) {
  console.error(
    "usage: compile-catalog-sqlite.mjs --spec <openapi.json|yaml> --out <catalog.sqlite>"
  );
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiUrl = pathToFileURL(resolve(root, "packages/clawql-api/dist/index.js")).href;
const api = await import(apiUrl);
const { loadOpenAPIFromAbsolutePath } = api;

const loaded = await loadOpenAPIFromAbsolutePath(specPath);
// Bake operation-risk into the board catalog so Bun LOAD=db and Rust share the same
// policy surface (GET allow / POST mandate / DELETE block) without a second merge pass.
const operations =
  typeof api.applyOperationRiskToLoadedOps === "function"
    ? await api.applyOperationRiskToLoadedOps(loaded.operations)
    : loaded.operations;
const openapis =
  loaded.openapis && loaded.openapis.length > 0 ? loaded.openapis : [loaded.openapi];
mkdirSync(dirname(outPath), { recursive: true });

if (typeof api.writeCatalogSqlite === "function") {
  api.writeCatalogSqlite(outPath, {
    operations,
    openapis,
    multi: loaded.multi,
  });
} else {
  const { DatabaseSync } = await import("node:sqlite");
  if (existsSync(outPath)) {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(outPath);
  }
  const db = new DatabaseSync(outPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, spec_index INTEGER NOT NULL, json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS openapi_docs (
      spec_index INTEGER PRIMARY KEY, json_gz BLOB NOT NULL
    );
    DELETE FROM operations; DELETE FROM openapi_docs; DELETE FROM meta;
  `);
  const insMeta = db.prepare("INSERT INTO meta(key, value) VALUES (?, ?)");
  insMeta.run("version", "1");
  insMeta.run("multi", loaded.multi || openapis.length > 1 ? "1" : "0");
  insMeta.run("ops", String(operations.length));
  insMeta.run("docs", String(openapis.length));
  insMeta.run("written_at", new Date().toISOString());
  const insOp = db.prepare(
    "INSERT INTO operations(id, spec_index, json) VALUES (?, ?, ?)"
  );
  for (const op of operations) {
    insOp.run(op.id, op.specIndex ?? 0, JSON.stringify(op));
  }
  const insDoc = db.prepare(
    "INSERT INTO openapi_docs(spec_index, json_gz) VALUES (?, ?)"
  );
  openapis.forEach((doc, i) => {
    insDoc.run(i, gzipSync(Buffer.from(JSON.stringify(doc), "utf8"), { level: 6 }));
  });
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
}

const meta = {
  out: outPath,
  ops: operations.length,
  docs: openapis.length,
  spec: specPath,
  spec_bytes: readFileSync(specPath).byteLength,
  schema: "catalog-sqlite/v1",
  riskApplied: typeof api.applyOperationRiskToLoadedOps === "function",
};
writeFileSync(outPath.replace(/\.sqlite$/i, "") + ".meta.json", JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
