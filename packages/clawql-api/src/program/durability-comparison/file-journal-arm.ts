/**
 * ClawQL file-journal kill-mid-write arm + optional naive-retry reference arm.
 * Counts duplicates and outcome_unknown under both upstream modes.
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
  ArmResult,
  ComparisonTrial,
  DurabilityArm,
  UpstreamMode,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KILL_WORKER = join(HERE, "..", "durable-runner-kill-worker.ts");
const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;
const WRITE_OP = "owners.create";

function planSource(): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1, idempotencyKey: "kill-mid-write-key" },
    })),
  });
}

type HostLogLine = {
  readonly operationId: string;
  readonly effectId: string;
  readonly applied: boolean;
};

function parseHostLog(raw: string): HostLogLine[] {
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

function recordingHost(opts: {
  readonly upstreamMode: UpstreamMode;
  readonly priorEffects: Set<string>;
}): { host: ProgramHost; executedWrites: string[]; uniqueEffects: Set<string> } {
  const executedWrites: string[] = [];
  const uniqueEffects = new Set(opts.priorEffects);
  let onceCounter = priorEffectsSize(opts.priorEffects);
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        if (input.operationId === WRITE_OP) {
          executedWrites.push(input.operationId);
          const key =
            typeof input.args?.idempotencyKey === "string"
              ? input.args.idempotencyKey
              : `anon-${executedWrites.length}`;
          if (opts.upstreamMode === "idempotent") {
            const effectId = `idem:${key}`;
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
    search: () => Effect.fail(new Error("search is not part of this plan")),
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

function priorEffectsSize(prior: Set<string>): number {
  let n = 0;
  for (const e of prior) {
    if (e.startsWith("once:")) n += 1;
  }
  return n;
}

function runKillWorker(env: Readonly<Record<string, string>>): Promise<{
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

async function oneTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: "clawql" | "naive-retry";
}): Promise<ComparisonTrial> {
  const dir = await mkdtemp(join(tmpdir(), `clawql-cmp-${input.i}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_cmp_${input.resumePolicy}_${String(input.i).padStart(4, "0")}`;
  const sessionId = `cmp-${input.resumePolicy}-${input.i}`;
  try {
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: programId,
      SESSION_ID: sessionId,
      SOURCE: planSource(),
      KILL_AT_OPERATION: WRITE_OP,
      WRITE_OPERATIONS: WRITE_OP,
      UPSTREAM_MODE: input.upstreamMode,
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

    if (input.resumePolicy === "naive-retry") {
      await Effect.runPromise(
        parent.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: "kill-mid-write-key" },
        })
      );
    }

    const duplicates = parent.executedWrites.length;
    const outcomeUnknown = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    const uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:")
    ).length;
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);
    const lost = !writeAppliedBefore && duplicates === 0 ? 1 : 0;

    const ok =
      input.resumePolicy === "clawql"
        ? child.signal === "SIGKILL" &&
          writeAppliedBefore &&
          duplicates === 0 &&
          outcomeUnknown >= 1 &&
          resumed.ok === false
        : child.signal === "SIGKILL" && writeAppliedBefore && duplicates >= 1;

    return {
      i: input.i,
      ok,
      duplicates,
      outcomeUnknown,
      lost,
      uniqueWriteEffects,
      childSignal: child.signal,
      detail: ok
        ? `${input.resumePolicy}/${input.upstreamMode}: duplicates=${duplicates} unknown=${outcomeUnknown} effects=${uniqueWriteEffects}`
        : `fail signal=${child.signal} duplicates=${duplicates} unknown=${outcomeUnknown} stderr=${child.stderr.slice(0, 80)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function summarizeMode(
  upstreamMode: UpstreamMode,
  trials: readonly ComparisonTrial[],
  requireZeroDuplicates: boolean
): ArmModeResult {
  const n = trials.length;
  const duplicates = trials.reduce((s, t) => s + t.duplicates, 0);
  const outcomeUnknown = trials.reduce((s, t) => s + t.outcomeUnknown, 0);
  const lost = trials.reduce((s, t) => s + t.lost, 0);
  const uniqueWriteEffects = trials.reduce((s, t) => s + t.uniqueWriteEffects, 0);
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
    trialsOk,
    trialsFailed,
    boardPass,
    trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
  };
}

function makeFileJournalArm(resumePolicy: "clawql" | "naive-retry"): DurabilityArm {
  const id = resumePolicy === "clawql" ? "clawql-file-journal" : "naive-retry";
  return {
    id,
    run: ({ n }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await oneTrial({ i, upstreamMode, resumePolicy }));
            }
            modes.push(summarizeMode(upstreamMode, trials, resumePolicy === "clawql"));
          }
          if (resumePolicy === "clawql") {
            return {
              armId: id,
              status: "measured",
              honesty:
                "ClawQL file-journal: no write re-send after SIGKILL; resume uses outcome_unknown. Duplicates must be 0 in both upstream modes.",
              modes,
            };
          }
          return {
            armId: id,
            status: "measured",
            honesty:
              "Reference arm: forces write re-send after kill. Idempotent upstream can mask duplicates; non_idempotent multiplies effects. Not ClawQL product behavior.",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const clawqlFileJournalArm = makeFileJournalArm("clawql");
export const naiveRetryArm = makeFileJournalArm("naive-retry");
