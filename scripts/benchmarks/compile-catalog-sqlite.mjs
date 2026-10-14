#!/usr/bin/env node
/**
 * Compile an OpenAPI JSON/YAML file into colocated catalog.sqlite.
 *
 *   node scripts/benchmarks/compile-catalog-sqlite.mjs \
 *     --spec /path/spec.json --out /path/catalog.sqlite
 *
 * Uses clawql-api load + persist (same scoring ops as runtime).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const specPath = resolve(arg("--spec", process.env.CLAWQL_SPEC_PATH || ""));
const outPath = resolve(arg("--out", process.env.CLAWQL_CATALOG_SQLITE_PATH || ""));
if (!specPath || !outPath) {
  console.error(
    "usage: compile-catalog-sqlite.mjs --spec <openapi.json> --out <catalog.sqlite>"
  );
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiUrl = pathToFileURL(resolve(root, "packages/clawql-api/dist/index.js")).href;
const { loadOpenAPIFromAbsolutePath, writeCatalogSqlite } = await import(apiUrl);

const loaded = await loadOpenAPIFromAbsolutePath(specPath);
const openapis =
  loaded.openapis && loaded.openapis.length > 0 ? loaded.openapis : [loaded.openapi];
mkdirSync(dirname(outPath), { recursive: true });
writeCatalogSqlite(outPath, {
  operations: loaded.operations,
  openapis,
  multi: loaded.multi,
});
const meta = {
  out: outPath,
  ops: loaded.operations.length,
  docs: openapis.length,
  spec: specPath,
  spec_bytes: readFileSync(specPath).byteLength,
};
writeFileSync(outPath.replace(/\.sqlite$/i, "") + ".meta.json", JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta, null, 2));
