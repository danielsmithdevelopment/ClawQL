#!/usr/bin/env node
/** Harvey LAB DMS → Node DuckDB (packages/clawql-data). No Python duckdb. */
import { resolve } from "node:path";
import { getClawqlDataStore } from "../../../packages/clawql-data/dist/index.js";

const mattersRoot = process.argv[2];
if (!mattersRoot) {
  console.error("Usage: node benchmarks/harvey-labs/scripts/lab-data-ingest.mjs /path/to/dms/matters");
  process.exit(1);
}

process.env.CLAWQL_ENABLE_DATA = "1";
if (!process.env.CLAWQL_DATA_PATH) {
  const harveyRoot = process.env.HARVEY_LABS?.trim();
  if (!harveyRoot) {
    console.error(
      "Set HARVEY_LABS (or CLAWQL_DATA_PATH) — do not rely on a machine-local /tmp path."
    );
    process.exit(1);
  }
  process.env.CLAWQL_DATA_PATH = resolve(harveyRoot, "harvey-lab-data.duckdb");
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
