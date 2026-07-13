import { Cause, Effect, Exit, Layer } from "effect";
import type { MemoryIngestInput, MemoryIngestResult } from "../ingest/ingest.js";
import type { MemoryRecallInput, MemoryRecallResult } from "../recall/recall.js";
import { EmbeddingService, embeddingLiveLayer } from "./embedding-service.js";
import { MemoryDbService, memoryDbLiveLayer } from "./memory-db-service.js";
import { MemoryIngestService, memoryIngestLiveLayer } from "./memory-ingest-service.js";
import { MemoryRecallService, memoryRecallLiveLayer } from "./memory-recall-service.js";
import { VaultConfigService, vaultConfigLiveLayer } from "./vault-config-service.js";

export type MemoryInfrastructureServices = VaultConfigService | MemoryDbService | EmbeddingService;

export type MemoryServices =
  MemoryInfrastructureServices | MemoryIngestService | MemoryRecallService;

/** Merged Effect Layer for clawql-memory domain + infrastructure services. */
export function memoryServicesLiveLayer(): Layer.Layer<MemoryServices> {
  return Layer.mergeAll(
    vaultConfigLiveLayer(),
    memoryDbLiveLayer(),
    embeddingLiveLayer(),
    memoryIngestLiveLayer(),
    memoryRecallLiveLayer()
  );
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
): Effect.Effect<MemoryIngestResult, unknown, MemoryServices> {
  return Effect.gen(function* () {
    const ingest = yield* MemoryIngestService;
    return yield* ingest.ingest(input);
  });
}

/** Recall via Effect services (used by {@link runMemoryRecall}). */
export function memoryRecallProgram(
  input: MemoryRecallInput
): Effect.Effect<MemoryRecallResult, unknown, MemoryServices> {
  return Effect.gen(function* () {
    const recall = yield* MemoryRecallService;
    return yield* recall.recall(input);
  });
}
