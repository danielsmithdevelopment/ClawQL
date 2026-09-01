import type { DataEngineFactory, DataEnginePlugin } from "./types.js";

const factories = new Map<string, DataEngineFactory>();

/** Register a data engine plugin (called from engine module init). */
export function registerDataEngine(id: string, factory: DataEngineFactory): void {
  factories.set(id.trim().toLowerCase(), factory);
}

/** List registered engine plugin ids. */
export function listDataEngineIds(): string[] {
  return [...factories.keys()].sort();
}

/** Resolve engine from `CLAWQL_DATA_ENGINE` (defaults to first registered, usually `duckdb`). */
export function resolveDataEnginePlugin(env: NodeJS.ProcessEnv = process.env): DataEnginePlugin {
  const raw = (env.CLAWQL_DATA_ENGINE ?? "duckdb").trim().toLowerCase();
  const factory = factories.get(raw);
  if (!factory) {
    const known = listDataEngineIds();
    throw new Error(
      `Unknown CLAWQL_DATA_ENGINE=${raw}. Registered data engine plugins: ${
        known.length ? known.join(", ") : "(none)"
      }`
    );
  }
  return factory(env);
}
