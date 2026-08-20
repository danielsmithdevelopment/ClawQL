import { registerDataEngine } from "../registry.js";
import { createDuckDbEnginePlugin } from "./duckdb-engine-plugin.js";

registerDataEngine("duckdb", createDuckDbEnginePlugin);

export { createDuckDbEnginePlugin, DuckDbEnginePlugin } from "./duckdb-engine-plugin.js";
export { DUCKDB_QUERY_HINT, resolveDuckDbPath } from "./duckdb-driver.js";
