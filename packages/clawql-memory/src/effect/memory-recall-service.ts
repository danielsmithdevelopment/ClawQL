import { Context, Effect, Layer } from "effect";
import {
  executeMemoryRecall,
  type MemoryRecallInput,
  type MemoryRecallResult,
} from "../recall/recall.js";
import { MemoryError } from "./memory-errors.js";

/** Effect service for vault memory recall (`memory_recall`). */
export class MemoryRecallService extends Context.Tag("clawql/MemoryRecallService")<
  MemoryRecallService,
  {
    readonly recall: (
      input: MemoryRecallInput
    ) => Effect.Effect<MemoryRecallResult, MemoryError>;
  }
>() {}

export function memoryRecallLiveLayer(): Layer.Layer<MemoryRecallService> {
  return Layer.succeed(
    MemoryRecallService,
    MemoryRecallService.of({
      recall: (input) =>
        Effect.tryPromise({
          try: () => executeMemoryRecall(input),
          catch: (cause) =>
            new MemoryError({
              reason: "memory recall failed",
              cause,
            }),
        }),
    })
  );
}
