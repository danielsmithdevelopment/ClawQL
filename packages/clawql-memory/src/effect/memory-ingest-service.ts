import { Context, Effect, Layer } from "effect";
import type { MemoryIngestInput, MemoryIngestResult } from "../ingest/ingest.js";
import { executeMemoryIngestEffect, type MemoryIngestServices } from "./memory-ingest-effect.js";
import { MemoryError } from "./memory-errors.js";

/** Effect service for vault memory ingest (`memory_ingest`). */
export class MemoryIngestService extends Context.Tag("clawql/MemoryIngestService")<
  MemoryIngestService,
  {
    readonly ingest: (
      input: MemoryIngestInput
    ) => Effect.Effect<MemoryIngestResult, MemoryError, MemoryIngestServices>;
  }
>() {}

export function memoryIngestLiveLayer(): Layer.Layer<MemoryIngestService> {
  return Layer.succeed(
    MemoryIngestService,
    MemoryIngestService.of({
      ingest: executeMemoryIngestEffect,
    })
  );
}
