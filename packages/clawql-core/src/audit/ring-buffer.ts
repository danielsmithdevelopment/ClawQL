import { getClawqlAuditMaxEntries } from "./config.js";
import type {
  AuditAppendResult,
  AuditClearResult,
  AuditListResult,
  ClawqlAuditEntry,
} from "./types.js";

export type AuditRingBuffer = {
  readonly append: (entry: ClawqlAuditEntry) => AuditAppendResult;
  readonly list: (limit: number) => AuditListResult;
  readonly clear: () => AuditClearResult;
  readonly reset: () => void;
};

export function createAuditRingBuffer(getMaxEntries: () => number): AuditRingBuffer {
  const buffer: ClawqlAuditEntry[] = [];

  return {
    append(entry: ClawqlAuditEntry): AuditAppendResult {
      buffer.push(entry);
      const max = getMaxEntries();
      let dropped = 0;
      while (buffer.length > max) {
        buffer.shift();
        dropped++;
      }
      return { total: buffer.length, dropped };
    },
    list(limit: number): AuditListResult {
      const max = getMaxEntries();
      const slice = buffer.slice(-limit);
      return { total: buffer.length, maxEntries: max, entries: slice };
    },
    clear(): AuditClearResult {
      const cleared = buffer.length;
      buffer.length = 0;
      return { cleared };
    },
    reset(): void {
      buffer.length = 0;
    },
  };
}

let defaultBuffer: AuditRingBuffer | undefined;

/** Shared in-process buffer for `clawql-mcp` until full Layer bootstrap at API startup. */
export function getDefaultAuditRingBuffer(): AuditRingBuffer {
  if (!defaultBuffer) {
    defaultBuffer = createAuditRingBuffer(getClawqlAuditMaxEntries);
  }
  return defaultBuffer;
}

/** Test helper — drops singleton so the next call creates a fresh buffer. */
export function resetDefaultAuditRingBufferForTests(): void {
  defaultBuffer?.reset();
  defaultBuffer = undefined;
}
