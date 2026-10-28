/**
 * Append-only trigger journal with an explicit flush policy.
 *
 * "Fired" for the durable_trigger_record definition means the record has been
 * flushed per this policy — not merely write(2)'d into the OS page cache.
 *
 * Policies:
 * - os_buffer: writeSync only (diagnostic; not crash-durable)
 * - fsync_each: fsync after every record (durability window = 0)
 * - group_commit: batch by size and/or interval, then one fsync (group commit)
 */

import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";

export type TriggerFlushMode = "os_buffer" | "fsync_each" | "group_commit";

export type TriggerFlushPolicy =
  | {
      readonly mode: "os_buffer";
    }
  | {
      readonly mode: "fsync_each";
    }
  | {
      readonly mode: "group_commit";
      readonly batchMax: number;
      readonly flushIntervalMs: number;
    };

/** Board default: group commit (legitimate DB-style durability). */
export const DEFAULT_TRIGGER_FLUSH_POLICY: TriggerFlushPolicy = {
  mode: "group_commit",
  batchMax: 64,
  flushIntervalMs: 10,
};

export type TriggerFlushPolicyInfo = {
  readonly mode: TriggerFlushMode;
  readonly batchMax: number | null;
  readonly flushIntervalMs: number | null;
  /** Max triggers that can be lost on crash after being counted as fired. */
  readonly durabilityWindowTriggers: number | null;
  /** Max wall time a counted fire may still be only in an unflushed batch. */
  readonly durabilityWindowMs: number | null;
  readonly crashSafe: boolean;
  readonly storage: "append_ndjson_file";
  readonly syncPrimitive: "none" | "fsync" | "fsync_group_commit";
  readonly note: string;
};

export function describeFlushPolicy(policy: TriggerFlushPolicy): TriggerFlushPolicyInfo {
  if (policy.mode === "os_buffer") {
    return {
      mode: "os_buffer",
      batchMax: null,
      flushIntervalMs: null,
      durabilityWindowTriggers: null,
      durabilityWindowMs: null,
      crashSafe: false,
      storage: "append_ndjson_file",
      syncPrimitive: "none",
      note: "writeSync into the OS page cache only — NOT crash-durable. Throughput here is a buffer write rate, not durable trigger throughput. Do not publish as durable.",
    };
  }
  if (policy.mode === "fsync_each") {
    return {
      mode: "fsync_each",
      batchMax: 1,
      flushIntervalMs: 0,
      durabilityWindowTriggers: 0,
      durabilityWindowMs: 0,
      crashSafe: true,
      storage: "append_ndjson_file",
      syncPrimitive: "fsync",
      note: "fsync after every record before counting as fired. Durability window = 0.",
    };
  }
  return {
    mode: "group_commit",
    batchMax: policy.batchMax,
    flushIntervalMs: policy.flushIntervalMs,
    // Counted fires wait for fsync — unflushed batch is never counted.
    durabilityWindowTriggers: 0,
    durabilityWindowMs: 0,
    crashSafe: true,
    storage: "append_ndjson_file",
    syncPrimitive: "fsync_group_commit",
    note: `Group commit: flush when batch reaches ${policy.batchMax} or every ${policy.flushIntervalMs} ms, then fsync. Fired stamps only after fsync — an unflushed batch is never counted, so a crash loses at most in-flight (not-yet-acked) work, not counted fires. Max wait for a fire ≈ flushIntervalMs (or sooner if batch fills).`,
  };
}

export type TriggerJournal = {
  readonly path: string;
  readonly policy: TriggerFlushPolicy;
  readonly policyInfo: TriggerFlushPolicyInfo;
  /**
   * Append a trigger and resolve only after it is durable per policy.
   * Returns the wall clock at durability (use as firedAt for lateness).
   */
  readonly record: (agentId: string, deadlineMs: number) => Promise<number>;
  /** Force flush of any pending batch; resolves when durable. */
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
};

type Waiter = {
  readonly resolve: (firedAt: number) => void;
  readonly reject: (err: unknown) => void;
};

export function openTriggerJournalEffect(
  dir: string,
  policy: TriggerFlushPolicy = DEFAULT_TRIGGER_FLUSH_POLICY
): Effect.Effect<TriggerJournal> {
  return Effect.sync(() => {
    const path = join(dir, `deadline-triggers-${process.pid}-${Date.now()}.ndjson`);
    const fd = openSync(path, "a");
    const policyInfo = describeFlushPolicy(policy);

    let pendingLines: string[] = [];
    let waiters: Waiter[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let flushing: Promise<void> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const armInterval = () => {
      if (policy.mode !== "group_commit" || timer || closed || pendingLines.length === 0) return;
      // Do NOT unref — pending waiters must keep the event loop alive until flush.
      timer = setTimeout(() => {
        timer = null;
        void flushNow();
      }, policy.flushIntervalMs);
    };

    const flushNow = (): Promise<void> => {
      if (flushing) return flushing;
      flushing = (async () => {
        for (;;) {
          if (pendingLines.length === 0) return;
          const lines = pendingLines;
          const batchWaiters = waiters;
          pendingLines = [];
          waiters = [];
          clearTimer();
          try {
            writeSync(fd, lines.join(""));
            if (policy.mode !== "os_buffer") {
              fsyncSync(fd);
            }
            const firedAt = Date.now();
            for (const w of batchWaiters) w.resolve(firedAt);
          } catch (err) {
            for (const w of batchWaiters) w.reject(err);
            throw err;
          }
          // Loop if more arrived during fsync.
          if (pendingLines.length === 0) return;
          if (policy.mode === "group_commit" && pendingLines.length < policy.batchMax) {
            armInterval();
            return;
          }
        }
      })().finally(() => {
        flushing = null;
      });
      return flushing;
    };

    const record = (agentId: string, deadlineMs: number): Promise<number> => {
      if (closed) return Promise.reject(new Error("trigger journal closed"));
      const line = `${JSON.stringify({ agentId, deadlineMs })}\n`;

      if (policy.mode === "os_buffer") {
        writeSync(fd, line);
        return Promise.resolve(Date.now());
      }

      if (policy.mode === "fsync_each") {
        writeSync(fd, line);
        fsyncSync(fd);
        return Promise.resolve(Date.now());
      }

      return new Promise<number>((resolve, reject) => {
        pendingLines.push(line);
        waiters.push({ resolve, reject });
        if (pendingLines.length >= policy.batchMax) {
          void flushNow();
        } else {
          armInterval();
        }
      });
    };

    const flush = async (): Promise<void> => {
      await flushNow();
    };

    const close = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      clearTimer();
      await flushNow();
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    };

    return {
      path,
      policy,
      policyInfo,
      record,
      flush,
      close,
    };
  });
}

export type TriggerJournalLine = {
  readonly agentId: string;
  readonly deadlineMs: number;
};

/** Parse a journal file; skips a trailing partial line (crash mid-write). */
export function readTriggerJournalEffect(path: string): Effect.Effect<readonly TriggerJournalLine[]> {
  return Effect.sync(() => {
    let raw = "";
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return [];
    }
    const out: TriggerJournalLine[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line) as { agentId?: unknown; deadlineMs?: unknown };
        if (typeof o.agentId === "string" && typeof o.deadlineMs === "number") {
          out.push({ agentId: o.agentId, deadlineMs: o.deadlineMs });
        }
      } catch {
        // Truncated last line after crash — ignore.
      }
    }
    return out;
  });
}
