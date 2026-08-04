/**
 * Typed MEMORY_* WORM / audit event kinds (Convergence Week / OKF v0.2).
 * Emitted alongside vault lifecycle transitions so compliance queries can
 * join trust signals without walking git history alone.
 */

export const MEMORY_WORM_EVENT_KINDS = [
  "MEMORY_INGESTED",
  "MEMORY_RECALL",
  "MEMORY_VERIFIED",
  "MEMORY_STALE",
  "MEMORY_SUPERSEDED",
  "MEMORY_RETRACTED",
  "MEMORY_MIGRATED",
] as const;

export type MemoryWormEventKind = (typeof MEMORY_WORM_EVENT_KINDS)[number];

export type MemoryWormEvent = {
  kind: MemoryWormEventKind;
  at: string;
  path?: string;
  correlationId?: string;
  wormRef?: string | null;
  detail?: Record<string, unknown>;
};

export type MemoryWormSink = (event: MemoryWormEvent) => void | Promise<void>;

const sinks: MemoryWormSink[] = [];

/** Register an optional sink (MCP audit buffer, WORM logger, tests). */
export function registerMemoryWormSink(sink: MemoryWormSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

/** Emit a MEMORY_* event to all registered sinks (best-effort). */
export async function emitMemoryWormEvent(event: MemoryWormEvent): Promise<void> {
  for (const sink of sinks) {
    try {
      await sink(event);
    } catch {
      /* never fail the vault write path on audit sink errors */
    }
  }
}

export function memoryWormEventFromStatus(input: {
  path: string;
  status: string;
  correlationId?: string;
  wormRef?: string | null;
  previousStatus?: string;
}): MemoryWormEvent | null {
  const at = new Date().toISOString();
  const base = {
    at,
    path: input.path,
    correlationId: input.correlationId,
    wormRef: input.wormRef,
    detail: { status: input.status, previousStatus: input.previousStatus },
  };
  switch (input.status) {
    case "stale":
      return { kind: "MEMORY_STALE", ...base };
    case "superseded":
      return { kind: "MEMORY_SUPERSEDED", ...base };
    case "retracted":
      return { kind: "MEMORY_RETRACTED", ...base };
    default:
      return null;
  }
}
