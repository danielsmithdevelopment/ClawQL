import { Context, Effect, Layer } from "effect";
import {
  executeMemoryIngest,
  type MemoryIngestInput,
  type MemoryIngestResult,
} from "../ingest/ingest.js";
import { MemoryError } from "./memory-errors.js";

/** Effect service for vault memory ingest (`memory_ingest`). */
export class MemoryIngestService extends Context.Tag("clawql/MemoryIngestService")<
  MemoryIngestService,
  {
    readonly ingest: (input: MemoryIngestInput) => Effect.Effect<MemoryIngestResult, MemoryError>;
  }
>() {}

export function memoryIngestLiveLayer(): Layer.Layer<MemoryIngestService> {
  return Layer.succeed(
    MemoryIngestService,
    MemoryIngestService.of({
      ingest: (input) =>
        Effect.tryPromise({
          try: () => executeMemoryIngest(input),
          catch: (cause) =>
            new MemoryError({
              reason: "memory ingest failed",
              cause,
            }),
        }),
    })
  );
}
