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
  catalogMatterFilesEffect,
  detectCapitalMarkets,
  detectRestructuring,
  enrichInventoryRows,
  enrichInventoryRowsEffect,
} from "./inventory.js";
export {
  detectHsrFromRelPaths,
  detectCreditFromRelPaths,
  detectClearanceFromRelPaths,
  detectHsrSecondRequest,
  detectCreditFacility,
  detectHsrClearance,
  applyStructuralPathFlags,
} from "./path-detectors.js";
export { ClawqlDataStore, getClawqlDataStore, resetClawqlDataStoreForTests } from "./store.js";
export { MATTER_COLUMNS } from "./schema.js";
export {
  DataError,
  dataFromPromise,
  dataFromSync,
  runDataEffect,
  dataQueryProgram,
  dataIngestProgram,
  dataStatusProgram,
  resetDataEngineForTests,
  DataEngineService,
  dataEngineLiveLayer,
} from "./effect/index.js";

/** @deprecated Use {@link DUCKDB_QUERY_HINT} or engine plugin hint. */
export { DUCKDB_QUERY_HINT as DATA_QUERY_HINT } from "./engines/duckdb/index.js";
