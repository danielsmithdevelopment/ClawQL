#!/usr/bin/env node
/**
 * Short-lived catalog builder — parse OpenAPI / provider sources, write
 * `catalog.sqlite`, exit. Gateway parents spawn this so the listen process never
 * retains the parsed OAS graph.
 *
 * Env (same as gateway listen):
 *   CLAWQL_SPEC_PATH / CLAWQL_SPEC_URL / providers… → loadSpecUncached inputs
 *   CLAWQL_CATALOG_SQLITE_PATH (required for non-default home)
 *   CLAWQL_HOME
 *
 * Always disables recursive sqlite hooks via CLAWQL_CATALOG_SQLITE=0.
 */
import { Effect } from "effect";
import { loadSpec } from "../spec/spec-loader.js";
import {
  persistLoadedSpecToCatalogSqliteEffect,
  resolveCatalogSqlitePath,
} from "./catalog-sqlite.js";

async function main(): Promise<void> {
  process.env.CLAWQL_CATALOG_SQLITE = "0";
  process.env.CLAWQL_CATALOG_SQLITE_OOP_CHILD = "1";

  const path = Effect.runSync(resolveCatalogSqlitePath());
  const loaded = await loadSpec();
  // Re-enable write path only through explicit persist (flag still 0; persist does not check it).
  await Effect.runPromise(persistLoadedSpecToCatalogSqliteEffect(loaded));
  console.error(
    `[catalog-sqlite] oop-wrote ${path} ops=${loaded.operations.length} pid=${process.pid}`
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[catalog-sqlite] oop-build failed: ${msg}`);
  process.exit(1);
});
