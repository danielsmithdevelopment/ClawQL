import { Context, Effect, Layer } from "effect";
import { getClawqlAuditMaxEntries } from "./config.js";
import {
  createAuditRingBuffer,
  getDefaultAuditRingBuffer,
  type AuditRingBuffer,
} from "./ring-buffer.js";
import type {
  AuditAppendResult,
  AuditClearResult,
  AuditListResult,
  ClawqlAuditEntry,
} from "./types.js";

export type AuditAppendInput = {
  readonly category: string;
  readonly action: string;
  readonly summary: string;
  readonly correlationId?: string;
};

export type AuditAppendWithEntry = AuditAppendResult & { readonly entry: ClawqlAuditEntry };

export class AuditService extends Context.Tag("clawql/AuditService")<
  AuditService,
  {
    readonly getMaxEntries: () => number;
    readonly append: (input: AuditAppendInput) => Effect.Effect<AuditAppendWithEntry>;
    readonly list: (limit: number) => Effect.Effect<AuditListResult>;
    readonly clear: () => Effect.Effect<AuditClearResult>;
    readonly resetForTests: () => Effect.Effect<void>;
  }
>() {}

function serviceFromBuffer(
  buffer: AuditRingBuffer,
  getMaxEntries: () => number,
  resetBuffer: () => void
) {
  return AuditService.of({
    getMaxEntries,
    append: (input) =>
      Effect.sync(() => {
        const entry: ClawqlAuditEntry = {
          ts: new Date().toISOString(),
          category: input.category,
          action: input.action,
          summary: input.summary,
          correlationId: input.correlationId,
        };
        const result = buffer.append(entry);
        return { ...result, entry };
      }),
    list: (limit: number) => Effect.sync(() => buffer.list(limit)),
    clear: () => Effect.sync(() => buffer.clear()),
    resetForTests: () => Effect.sync(() => resetBuffer()),
  });
}

/** In-memory ring buffer backed by the process-wide default buffer (MCP bridge). */
export const AuditLive = Layer.effect(
  AuditService,
  Effect.sync(() =>
    serviceFromBuffer(getDefaultAuditRingBuffer(), getClawqlAuditMaxEntries, () =>
      getDefaultAuditRingBuffer().reset()
    )
  )
);

/** Isolated buffer for unit tests (`Effect.provide(AuditTestLayer)`). */
export const AuditTestLayer = Layer.effect(
  AuditService,
  Effect.sync(() => {
    const buffer = createAuditRingBuffer(() => 500);
    return serviceFromBuffer(
      buffer,
      () => 500,
      () => buffer.reset()
    );
  })
);
