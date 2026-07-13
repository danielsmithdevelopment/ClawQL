import { Cause, Effect, Exit, Layer } from "effect";
import type { MemoryIngestInput, MemoryIngestResult } from "../ingest/ingest.js";
import type { MemoryRecallInput, MemoryRecallResult } from "../recall/recall.js";
import { MemoryIngestService, memoryIngestLiveLayer } from "./memory-ingest-service.js";
import { MemoryRecallService, memoryRecallLiveLayer } from "./memory-recall-service.js";

export type MemoryServices = MemoryIngestService | MemoryRecallService;

/** Merged Effect Layer for clawql-memory domain services. */
export function memoryServicesLiveLayer(): Layer.Layer<MemoryServices> {
  return Layer.mergeAll(memoryIngestLiveLayer(), memoryRecallLiveLayer());
}

/** Run a memory Effect program with default services Layer. */
export async function runMemoryEffect<A, E>(
  program: Effect.Effect<A, E, MemoryServices>
): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(memoryServicesLiveLayer())));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** Ingest via Effect services (used by {@link runMemoryIngest}). */
export function memoryIngestProgram(
  input: MemoryIngestInput
): Effect.Effect<MemoryIngestResult, unknown, MemoryIngestService> {
  return Effect.gen(function* () {
    const ingest = yield* MemoryIngestService;
    return yield* ingest.ingest(input);
  });
}

/** Recall via Effect services (used by {@link runMemoryRecall}). */
export function memoryRecallProgram(
  input: MemoryRecallInput
): Effect.Effect<MemoryRecallResult, unknown, MemoryRecallService> {
  return Effect.gen(function* () {
    const recall = yield* MemoryRecallService;
    return yield* recall.recall(input);
  });
}
