import { Context, Effect, Layer } from "effect";
import type { DataEnginePlugin } from "../engines/types.js";
import { resolveDataEnginePlugin } from "../engines/registry.js";
import "../engines/duckdb/index.js";
import type { DataQueryResult, DataStatus, IngestPayload, IngestResult } from "../engines/types.js";
import { dataFromPromise } from "./data-effect-utils.js";

/** Effect service: active {@link DataEnginePlugin} from registry. */
export class DataEngineService extends Context.Tag("clawql/DataEngineService")<
  DataEngineService,
  {
    readonly engine: () => DataEnginePlugin;
    readonly query: (sql: string) => Effect.Effect<DataQueryResult, never>;
    readonly ingest: (payload: IngestPayload) => Effect.Effect<IngestResult, never>;
    readonly status: () => DataStatus;
    readonly close: () => Effect.Effect<void, never>;
  }
>() {}

export function dataEngineLiveLayer(env: NodeJS.ProcessEnv = process.env): Layer.Layer<DataEngineService> {
  const plugin = resolveDataEnginePlugin(env);
  return Layer.succeed(
    DataEngineService,
    DataEngineService.of({
      engine: () => plugin,
      query: (sql) => dataFromPromise(() => plugin.query(sql)),
      ingest: (payload) => dataFromPromise(() => plugin.ingest(payload)),
      status: () => plugin.status(),
      close: () => dataFromPromise(() => plugin.close()),
    })
  );
}
