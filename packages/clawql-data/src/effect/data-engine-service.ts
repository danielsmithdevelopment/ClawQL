import { Context, Effect, Layer } from "effect";
import type { DataEnginePlugin } from "../engines/types.js";
import { resolveDataEnginePlugin } from "../engines/registry.js";
import "../engines/duckdb/index.js";
import type { DataQueryResult, DataStatus, IngestPayload, IngestResult } from "../engines/types.js";
import type { DataError } from "./data-errors.js";

/** Effect service: active {@link DataEnginePlugin} from registry (Effect-native). */
export class DataEngineService extends Context.Tag("clawql/DataEngineService")<
  DataEngineService,
  {
    readonly engine: () => DataEnginePlugin;
    readonly query: (sql: string) => Effect.Effect<DataQueryResult, DataError>;
    readonly ingest: (payload: IngestPayload) => Effect.Effect<IngestResult, DataError>;
    readonly status: () => DataStatus;
    readonly close: () => Effect.Effect<void, DataError>;
  }
>() {}

export function dataEngineLiveLayer(env: NodeJS.ProcessEnv = process.env): Layer.Layer<DataEngineService> {
  const plugin = resolveDataEnginePlugin(env);
  return Layer.succeed(
    DataEngineService,
    DataEngineService.of({
      engine: () => plugin,
      query: (sql) => plugin.query(sql),
      ingest: (payload) => plugin.ingest(payload),
      status: () => plugin.status(),
      close: () => plugin.close(),
    })
  );
}
