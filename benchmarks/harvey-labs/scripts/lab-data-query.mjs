#!/usr/bin/env node
/** Run read-only SQL against clawql-data DuckDB (stdin or argv). */
import { getClawqlDataStore } from "../../../packages/clawql-data/dist/index.js";

process.env.CLAWQL_ENABLE_DATA = "1";

const sql = process.argv[2] ?? (await new Response(process.stdin).text()).trim();
if (!sql) {
  console.error("Usage: node lab-data-query.mjs 'SELECT count(*) FROM matters'");
  process.exit(1);
}

const store = getClawqlDataStore();
try {
  const result = await store.query(sql);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await store.close();
}
