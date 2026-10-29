/**
 * Crash-recovery proof for the trigger journal flush policy.
 *
 * Child records triggers and ACKs each counted fire on stdout only after
 * durable flush. Parent SIGKILLs mid-drain, then verifies every ACK'd fire
 * is on disk exactly once.
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import type { DeadlineCrashTestResult } from "./deadline-schedule.js";
import {
  DEFAULT_TRIGGER_FLUSH_POLICY,
  describeFlushPolicy,
  readTriggerJournalEffect,
  type TriggerFlushPolicy,
} from "./trigger-journal.js";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "trigger-journal-crash-worker.ts");

export function runTriggerJournalCrashTestEffect(args: {
  readonly workDir: string;
  readonly policy?: TriggerFlushPolicy;
  readonly total?: number;
  readonly concurrency?: number;
  /** Kill after this many durable acks (must be < total). */
  readonly killAfterAcks?: number;
}): Effect.Effect<DeadlineCrashTestResult> {
  return Effect.promise(async () => {
    const policy = args.policy ?? DEFAULT_TRIGGER_FLUSH_POLICY;
    const policyInfo = describeFlushPolicy(policy);
    const total = args.total ?? 2_000;
    const concurrency = args.concurrency ?? 32;
    const killAfter = args.killAfterAcks ?? Math.min(400, Math.floor(total / 3));

    if (policy.mode === "os_buffer") {
      return {
        ok: false,
        policy: policyInfo,
        countedFired: 0,
        recoveredOnDisk: 0,
        missingFromDisk: 0,
        duplicateOnDisk: 0,
        note: "Crash test skipped for os_buffer — policy is not crash-safe by definition.",
      };
    }

    mkdirSync(args.workDir, { recursive: true });

    const acks = new Map<string, number>();
    let journalPath = "";
    let killed = false;
    let stderr = "";

    const child = spawn(process.execPath, ["--import", "tsx", WORKER], {
      cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
      env: {
        ...process.env,
        CLAWQL_CRASH_JOURNAL_DIR: args.workDir,
        CLAWQL_CRASH_FLUSH_POLICY: JSON.stringify(policy),
        CLAWQL_CRASH_TOTAL: String(total),
        CLAWQL_CRASH_CONCURRENCY: String(concurrency),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await new Promise<void>((resolve, reject) => {
      let buf = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.startsWith("JOURNAL\t")) {
            journalPath = line.slice("JOURNAL\t".length);
          } else if (line.startsWith("ACK\t")) {
            const parts = line.split("\t");
            const agentId = parts[1]!;
            const deadlineMs = Number(parts[2]);
            const key = `${agentId}|${deadlineMs}`;
            acks.set(key, (acks.get(key) ?? 0) + 1);
            if (!killed && acks.size >= killAfter) {
              killed = true;
              child.kill("SIGKILL");
            }
          }
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", () => resolve());
    });

    if (!journalPath) {
      return {
        ok: false,
        policy: policyInfo,
        countedFired: acks.size,
        recoveredOnDisk: 0,
        missingFromDisk: acks.size,
        duplicateOnDisk: 0,
        note: `Crash worker did not report a journal path. stderr=${stderr.slice(0, 500)}`,
      };
    }

    const onDisk = await Effect.runPromise(readTriggerJournalEffect(journalPath));
    const diskKeys = new Map<string, number>();
    for (const row of onDisk) {
      const k = `${row.agentId}|${row.deadlineMs}`;
      diskKeys.set(k, (diskKeys.get(k) ?? 0) + 1);
    }

    let missing = 0;
    for (const k of acks.keys()) {
      if (!diskKeys.has(k)) missing += 1;
    }
    let duplicates = 0;
    for (const n of diskKeys.values()) {
      if (n > 1) duplicates += 1;
    }

    const ok = missing === 0 && duplicates === 0 && acks.size > 0 && killed;
    return {
      ok,
      policy: policyInfo,
      countedFired: acks.size,
      recoveredOnDisk: onDisk.length,
      missingFromDisk: missing,
      duplicateOnDisk: duplicates,
      note: ok
        ? `SIGKILL after ${acks.size} durable acks; all counted fires present on disk exactly once (journal=${journalPath}).`
        : `Crash proof failed: missing=${missing}, duplicates=${duplicates}, acks=${acks.size}, onDisk=${onDisk.length}, killed=${killed}. stderr=${stderr.slice(0, 300)}`,
    };
  });
}
