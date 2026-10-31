/**
 * Shared kill-mid-write trial helpers for file-journal, peer-model sims, and lost-ack pilots.
 */

import { fork } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resumeProgramEffect } from "../durable-runner.js";
import { programJournalFileLayer } from "../program-journal.js";
import type { ProgramHost } from "../program-runner.js";
import type {
  ArmModeResult,
  ComparisonTrial,
  UpstreamMode,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const KILL_WORKER = join(HERE, "..", "durable-runner-kill-worker.ts");
export const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;
export const WRITE_OP = "owners.create";

export function planSource(opts?: { readonly includeIdempotencyKey?: boolean }): string {
  const withKey = opts?.includeIdempotencyKey !== false;
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: withKey
        ? { page: i + 1, idempotencyKey: "kill-mid-write-key" }
        : { page: i + 1 },
    })),
  });
}

export type HostLogLine = {
  readonly operationId: string;
  readonly effectId: string;
  readonly applied: boolean;
};

export function parseHostLog(raw: string): HostLogLine[] {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const o = JSON.parse(line) as HostLogLine;
        if (o && typeof o.operationId === "string") return o;
      } catch {
        /* legacy: bare operationId */
      }
      return { operationId: line.trim(), effectId: line.trim(), applied: true };
    });
}

function priorEffectsSize(prior: Set<string>): number {
  let n = 0;
  for (const e of prior) {
    if (e.startsWith("once:")) n += 1;
  }
  return n;
}

export function recordingHost(opts: {
  readonly upstreamMode: UpstreamMode;
  readonly priorEffects: Set<string>;
}): { host: ProgramHost; executedWrites: string[]; uniqueEffects: Set<string> } {
  const executedWrites: string[] = [];
  const uniqueEffects = new Set(opts.priorEffects);
  let onceCounter = priorEffectsSize(opts.priorEffects);
  const host: ProgramHost = {
    execute: (input, _ctx) =>
      Effect.sync(() => {
        if (input.operationId === WRITE_OP) {
          executedWrites.push(input.operationId);
          const key =
            typeof input.args?.idempotencyKey === "string"
              ? input.args.idempotencyKey
              : `anon-${executedWrites.length}`;
          if (opts.upstreamMode === "idempotent" || opts.upstreamMode === "lookup_by_reference") {
            // lookup_by_reference resolves by stable id; treat key as the reference.
            const effectId =
              opts.upstreamMode === "lookup_by_reference" ? `ref:${key}` : `idem:${key}`;
            if (uniqueEffects.has(effectId)) {
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify({ ok: true, deduped: true }) },
                ],
              };
            }
            uniqueEffects.add(effectId);
          } else {
            onceCounter += 1;
            uniqueEffects.add(`once:${onceCounter}`);
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, operationId: input.operationId }),
            },
          ],
        };
      }),
    search: (_input, _ctx) => Effect.fail(new Error("search is not part of this plan")),
    resolveRisk: (operationId) =>
      Effect.succeed({
        found: true,
        policy: "allow" as const,
        risk: {
          policy: "allow" as const,
          level: "LOW" as const,
          source: "spec-default" as const,
          reason: "durability-comparison",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
          specLabel: "pets",
        },
      }),
  };
  return { host, executedWrites, uniqueEffects };
}

export function runKillWorker(env: Readonly<Record<string, string>>): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = fork(KILL_WORKER, [], {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code, signal, stderr }));
  });
}

export type ResumePolicy =
  | "clawql"
  | "naive-retry"
  | "golem-at-least-once-sim"
  | "pi-interrupt-sim"
  | "lost-ack-clawql"
  | "lost-ack-keyed-retry"
  | "lost-ack-lookup";

/** Map board upstream mode → kill-worker UPSTREAM_MODE (idempotent | non_idempotent). */
export function workerUpstreamMode(mode: UpstreamMode): "idempotent" | "non_idempotent" {
  if (mode === "idempotent" || mode === "lookup_by_reference") return "idempotent";
  return "non_idempotent";
}

export async function oneKillMidWriteTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: ResumePolicy;
  readonly includeIdempotencyKey?: boolean;
}): Promise<ComparisonTrial> {
  const dir = await mkdtemp(join(tmpdir(), `clawql-cmp-${input.i}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_cmp_${input.resumePolicy}_${String(input.i).padStart(4, "0")}`;
  const sessionId = `cmp-${input.resumePolicy}-${input.i}`;
  const includeKey = input.includeIdempotencyKey !== false;
  try {
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: programId,
      SESSION_ID: sessionId,
      SOURCE: planSource({ includeIdempotencyKey: includeKey }),
      KILL_AT_OPERATION: WRITE_OP,
      WRITE_OPERATIONS: WRITE_OP,
      UPSTREAM_MODE: workerUpstreamMode(input.upstreamMode),
    });
    const before = parseHostLog(await readFile(hostLog, "utf8"));
    const priorEffects = new Set(
      before.filter((l) => l.operationId === WRITE_OP && l.applied).map((l) => l.effectId)
    );
    const parent = recordingHost({
      upstreamMode: input.upstreamMode,
      priorEffects,
    });

    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, parent.host, {}, { sessionId }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );

    const retries =
      input.resumePolicy === "naive-retry" ||
      input.resumePolicy === "golem-at-least-once-sim" ||
      input.resumePolicy === "pi-interrupt-sim";

    if (retries) {
      await Effect.runPromise(
        parent.host.execute(
          {
            operationId: WRITE_OP,
            args: includeKey
              ? { page: 3, idempotencyKey: "kill-mid-write-key" }
              : { page: 3 },
          },
          { programId }
        )
      );
    }

    let duplicates = parent.executedWrites.length;
    let outcomeUnknown = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    let uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:") || e.startsWith("ref:")
    ).length;
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);
    let lost = !writeAppliedBefore && duplicates === 0 ? 1 : 0;
    const callVerifiedSent = writeAppliedBefore ? 1 : 0;
    let intentPresentOnResume = outcomeUnknown >= 1 ? 1 : 0;

    // Lost-ack + idempotency keys: safe resend with the same key (server dedupes → one unique effect).
    // Mirrors REST clawql-mandate keyed redrive. Durable-runner still parks unknown today — this
    // pilot measures the resolution path the product claims for key-capable APIs.
    if (
      input.resumePolicy === "lost-ack-keyed-retry" &&
      writeAppliedBefore &&
      outcomeUnknown >= 1 &&
      includeKey
    ) {
      await Effect.runPromise(
        parent.host.execute(
          {
            operationId: WRITE_OP,
            args: { page: 3, idempotencyKey: "kill-mid-write-key" },
          },
          { programId }
        )
      );
      duplicates = parent.executedWrites.length;
      uniqueWriteEffects = [...parent.uniqueEffects].filter(
        (e) => e.startsWith("idem:") || e.startsWith("once:") || e.startsWith("ref:")
      ).length;
      if (uniqueWriteEffects === 1) {
        outcomeUnknown = 0;
        lost = 0;
        intentPresentOnResume = 1;
      }
    }

    // Lost-ack + lookup-by-reference: server applied; check by reference; do not re-send.
    if (input.resumePolicy === "lost-ack-lookup" && writeAppliedBefore && outcomeUnknown >= 1) {
      const refHit = before.some(
        (l) => l.operationId === WRITE_OP && l.applied && l.effectId.startsWith("idem:")
      );
      if (refHit) {
        outcomeUnknown = 0;
        lost = 0;
        duplicates = 0;
        uniqueWriteEffects = Math.max(uniqueWriteEffects, 1);
        intentPresentOnResume = 1;
      }
    }

    const ok = trialOk({
      resumePolicy: input.resumePolicy,
      upstreamMode: input.upstreamMode,
      childSignal: child.signal,
      writeAppliedBefore,
      duplicates,
      outcomeUnknown,
      intentPresentOnResume,
      callVerifiedSent,
      uniqueWriteEffects,
      resumedOk: resumed.ok,
    });

    return {
      i: input.i,
      ok,
      duplicates,
      outcomeUnknown,
      lost,
      uniqueWriteEffects,
      intentPresentOnResume,
      callVerifiedSent,
      childSignal: child.signal,
      detail: ok
        ? `${input.resumePolicy}/${input.upstreamMode}: duplicates=${duplicates} unknown=${outcomeUnknown} intent=${intentPresentOnResume} sent=${callVerifiedSent} effects=${uniqueWriteEffects}`
        : `fail signal=${child.signal} duplicates=${duplicates} unknown=${outcomeUnknown} stderr=${child.stderr.slice(0, 80)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function trialOk(input: {
  readonly resumePolicy: ResumePolicy;
  readonly upstreamMode: UpstreamMode;
  readonly childSignal: NodeJS.Signals | null;
  readonly writeAppliedBefore: boolean;
  readonly duplicates: number;
  readonly outcomeUnknown: number;
  readonly intentPresentOnResume: number;
  readonly callVerifiedSent: number;
  readonly uniqueWriteEffects: number;
  readonly resumedOk: boolean;
}): boolean {
  if (input.childSignal !== "SIGKILL" || !input.writeAppliedBefore) return false;

  if (input.resumePolicy === "clawql" || input.resumePolicy === "lost-ack-clawql") {
    return (
      input.duplicates === 0 &&
      input.outcomeUnknown >= 1 &&
      input.intentPresentOnResume === 1 &&
      input.callVerifiedSent === 1 &&
      input.resumedOk === false
    );
  }

  if (input.resumePolicy === "lost-ack-keyed-retry") {
    return (
      input.outcomeUnknown === 0 &&
      input.intentPresentOnResume === 1 &&
      input.callVerifiedSent === 1 &&
      input.uniqueWriteEffects === 1
    );
  }

  if (input.resumePolicy === "lost-ack-lookup") {
    return (
      input.duplicates === 0 &&
      input.outcomeUnknown === 0 &&
      input.intentPresentOnResume === 1 &&
      input.callVerifiedSent === 1 &&
      input.uniqueWriteEffects >= 1
    );
  }

  if (input.resumePolicy === "naive-retry") {
    return input.duplicates >= 1;
  }

  // Golem / Pi sims: at-least-once retry after kill.
  if (
    input.resumePolicy === "golem-at-least-once-sim" ||
    input.resumePolicy === "pi-interrupt-sim"
  ) {
    if (input.upstreamMode === "idempotent") {
      return input.duplicates >= 1 && input.uniqueWriteEffects === 1 && input.callVerifiedSent === 1;
    }
    return input.duplicates >= 1 && input.uniqueWriteEffects >= 2 && input.callVerifiedSent === 1;
  }

  return false;
}

export function summarizeMode(
  upstreamMode: UpstreamMode,
  trials: readonly ComparisonTrial[],
  requireZeroDuplicates: boolean
): ArmModeResult {
  const n = trials.length;
  const duplicates = trials.reduce((s, t) => s + t.duplicates, 0);
  const outcomeUnknown = trials.reduce((s, t) => s + t.outcomeUnknown, 0);
  const lost = trials.reduce((s, t) => s + t.lost, 0);
  const uniqueWriteEffects = trials.reduce((s, t) => s + t.uniqueWriteEffects, 0);
  const intentPresentOnResume = trials.reduce((s, t) => s + t.intentPresentOnResume, 0);
  const callVerifiedSent = trials.reduce((s, t) => s + t.callVerifiedSent, 0);
  const trialsOk = trials.filter((t) => t.ok).length;
  const trialsFailed = n - trialsOk;
  const boardPass = trialsFailed === 0 && (!requireZeroDuplicates || duplicates === 0);
  return {
    upstreamMode,
    n,
    duplicates,
    outcomeUnknown,
    lost,
    uniqueWriteEffects,
    intentPresentOnResume,
    callVerifiedSent,
    trialsOk,
    trialsFailed,
    boardPass,
    trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
  };
}
