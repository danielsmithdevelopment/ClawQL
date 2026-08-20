import { Effect } from "effect";
import "./engines/duckdb/index.js";
import { resolveDataEnginePlugin } from "./engines/registry.js";
import type {
  DataEnginePlugin,
  DataQueryResult,
  DataStatus,
  IngestPayload,
  IngestResult,
  OpenFactRow,
} from "./engines/types.js";
import type { MatterDocumentRow } from "./inventory.js";

export type { MatterDocumentRow };

/**
 * Promise facade over the Effect-native {@link DataEnginePlugin}.
 * Lab scripts and tests use this; MCP goes through {@link runDataEffect}.
 */
export class ClawqlDataStore {
  private readonly plugin: DataEnginePlugin;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.plugin = resolveDataEnginePlugin(env);
  }

  engineId(): string {
    return this.plugin.id;
  }

  path(): string {
    return this.plugin.path;
  }

  ingest(payload: IngestPayload): Promise<IngestResult> {
    return Effect.runPromise(this.plugin.ingest(payload));
  }

  query(sql: string): Promise<DataQueryResult> {
    return Effect.runPromise(this.plugin.query(sql));
  }

  status(): DataStatus {
    return this.plugin.status();
  }

  close(): Promise<void> {
    return Effect.runPromise(this.plugin.close());
  }
}

let processStore: ClawqlDataStore | null = null;

export function getClawqlDataStore(env: NodeJS.ProcessEnv = process.env): ClawqlDataStore {
  processStore ??= new ClawqlDataStore(env);
  return processStore;
}

export async function resetClawqlDataStoreForTests(): Promise<void> {
  if (processStore) await processStore.close();
  processStore = null;
}

export type { OpenFactRow, IngestPayload, IngestResult, DataQueryResult, DataStatus };
