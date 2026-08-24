import { HASH_CHAIN_GENESIS, sealHashChainRecord, verifyHashChain } from "../hash-chain/index.js";
import { getClawqlAuditMaxEntries } from "./config.js";
import type {
  AuditAppendResult,
  AuditClearResult,
  AuditListResult,
  AuditVerifyResult,
  ClawqlAuditEntry,
  ClawqlAuditPayload,
} from "./types.js";

export type AuditRingBuffer = {
  readonly append: (entry: ClawqlAuditPayload) => AuditAppendResult & { entry: ClawqlAuditEntry };
  readonly list: (limit: number) => AuditListResult;
  readonly clear: () => AuditClearResult;
  readonly verify: () => AuditVerifyResult;
  readonly reset: () => void;
};

export function createAuditRingBuffer(getMaxEntries: () => number): AuditRingBuffer {
  const buffer: ClawqlAuditEntry[] = [];
  let nextSeq = 1;
  let lastHash = HASH_CHAIN_GENESIS;

  return {
    append(payload: ClawqlAuditPayload): AuditAppendResult & { entry: ClawqlAuditEntry } {
      const entry = sealHashChainRecord(
        {
          ts: payload.ts,
          category: payload.category,
          action: payload.action,
          summary: payload.summary,
          ...(payload.correlationId !== undefined ? { correlationId: payload.correlationId } : {}),
        },
        nextSeq,
        lastHash
      );
      nextSeq += 1;
      lastHash = entry.hash;
      buffer.push(entry);
      const max = getMaxEntries();
      let dropped = 0;
      while (buffer.length > max) {
        buffer.shift();
        dropped++;
      }
      return { total: buffer.length, dropped, entry };
    },
    list(limit: number): AuditListResult {
      const max = getMaxEntries();
      const slice = buffer.slice(-limit);
      return { total: buffer.length, maxEntries: max, entries: slice };
    },
    clear(): AuditClearResult {
      const cleared = buffer.length;
      buffer.length = 0;
      nextSeq = 1;
      lastHash = HASH_CHAIN_GENESIS;
      return { cleared };
    },
    verify(): AuditVerifyResult {
      return verifyHashChain(buffer, { requireGenesis: false });
    },
    reset(): void {
      buffer.length = 0;
      nextSeq = 1;
      lastHash = HASH_CHAIN_GENESIS;
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

export function resetDefaultAuditRingBufferForTests(): void {
  defaultBuffer?.reset();
  defaultBuffer = undefined;
}
