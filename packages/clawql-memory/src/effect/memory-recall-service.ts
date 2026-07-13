import { Context, Effect, Layer } from "effect";
import type { MemoryRecallInput, MemoryRecallResult } from "../recall/recall.js";
import { executeMemoryRecallEffect, type MemoryRecallServices } from "./memory-recall-effect.js";
import { MemoryError } from "./memory-errors.js";
import { VaultConfigService } from "./vault-config-service.js";

/** Effect service for vault memory recall (`memory_recall`). */
export class MemoryRecallService extends Context.Tag("clawql/MemoryRecallService")<
  MemoryRecallService,
  {
    readonly recall: (
      input: MemoryRecallInput
    ) => Effect.Effect<MemoryRecallResult, MemoryError, VaultConfigService | MemoryRecallServices>;
  }
>() {}

export function memoryRecallLiveLayer(): Layer.Layer<MemoryRecallService> {
  return Layer.succeed(
    MemoryRecallService,
    MemoryRecallService.of({
      recall: executeMemoryRecallEffect,
    })
  );
}
