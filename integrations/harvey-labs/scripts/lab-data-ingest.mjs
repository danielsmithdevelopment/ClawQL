#!/usr/bin/env node
/** Harvey LAB DMS → Node DuckDB (packages/clawql-data). No Python duckdb. */
import { resolve } from "node:path";
import { getClawqlDataStore } from "../../../packages/clawql-data/dist/index.js";

const mattersRoot = process.argv[2];
if (!mattersRoot) {
  console.error("Usage: node integrations/harvey-labs/scripts/lab-data-ingest.mjs /path/to/dms/matters");
  process.exit(1);
}

process.env.CLAWQL_ENABLE_DATA = "1";
if (!process.env.CLAWQL_DATA_PATH) {
  process.env.CLAWQL_DATA_PATH = resolve("/tmp/harvey-lab-data.duckdb");
}

const store = getClawqlDataStore();
try {
  const result = await store.ingest({
    replace: true,
    mattersRoot: resolve(mattersRoot),
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await store.close();
}
