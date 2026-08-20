export type {
  DataEngineId,
  DataEnginePlugin,
  DataEngineFactory,
  DataQueryResult,
  DataQueryOk,
  DataQueryErr,
  IngestPayload,
  IngestResult,
  DataStatus,
  OpenFactRow,
} from "./engines/types.js";
export { registerDataEngine, listDataEngineIds, resolveDataEnginePlugin } from "./engines/registry.js";
export { DUCKDB_QUERY_HINT, resolveDuckDbPath } from "./engines/duckdb/index.js";
export { validateReadonlySelect } from "./sql-guard.js";
export {
  inferDocType,
  extractKeyTermsFromText,
  catalogMatterFiles,
  detectCapitalMarkets,
  detectRestructuring,
  enrichInventoryRows,
} from "./inventory.js";
export { ClawqlDataStore, getClawqlDataStore, resetClawqlDataStoreForTests } from "./store.js";
export { MATTER_COLUMNS } from "./schema.js";
export {
  runDataEffect,
  dataQueryProgram,
  dataIngestProgram,
  dataStatusProgram,
  resetDataEngineForTests,
} from "./effect/index.js";

/** @deprecated Use {@link DUCKDB_QUERY_HINT} or engine plugin hint. */
export { DUCKDB_QUERY_HINT as DATA_QUERY_HINT } from "./engines/duckdb/index.js";
