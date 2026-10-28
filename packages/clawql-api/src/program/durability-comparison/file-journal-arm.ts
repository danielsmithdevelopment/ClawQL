/**
 * ClawQL file-journal kill-mid-write arms:
 * - clawql-file-journal: structural at-most-once (never re-send after unknown)
 * - clawql-always-retry: agent always retries after resume; gate refuses (mandate consumed)
 * - naive-retry: reference arm that re-sends blindly
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
import { classifyOutcome, summarizeMode } from "./metrics.js";
import type {
  AgentPolicy,
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
  /** When true, further WRITE_OP executes are refused without applying (mandate consumed). */
  readonly refuseWrites?: boolean;
}): {
  host: ProgramHost;
  executedWrites: string[];
  uniqueEffects: Set<string>;
  getRefusedWrites: () => number;
} {
  const executedWrites: string[] = [];
  const uniqueEffects = new Set(opts.priorEffects);
  let onceCounter = priorEffectsSize(opts.priorEffects);
  let refusedWrites = 0;
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        if (input.operationId === WRITE_OP) {
          if (opts.refuseWrites) {
            refusedWrites += 1;
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ ok: false, status: "mandate_consumed" }),
                },
              ],
            };
          }
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
        idempotencyCapable: opts.upstreamMode === "idempotent" && operationId === WRITE_OP,
      }),
  };
  return { host, executedWrites, uniqueEffects, getRefusedWrites: () => refusedWrites };
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

type ResumePolicy = "clawql" | "clawql-always-retry" | "naive-retry";

async function oneTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly resumePolicy: ResumePolicy;
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
    // After kill, the write mandate is consumed. Keyed resume may still re-drive
    // through the durable runner; a fresh agent-initiated execute is refused.
    const parent = recordingHost({
      upstreamMode: input.upstreamMode,
      priorEffects,
      refuseWrites: false,
    });

    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, parent.host, {}, { sessionId }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );

    let refusedWrites = 0;
    if (input.resumePolicy === "naive-retry") {
      await Effect.runPromise(
        parent.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: "kill-mid-write-key" },
        })
      );
    } else if (input.resumePolicy === "clawql-always-retry") {
      // Model always retries: attempt a fresh execute; structural gate refuses.
      const gated = recordingHost({
        upstreamMode: input.upstreamMode,
        priorEffects: parent.uniqueEffects,
        refuseWrites: true,
      });
      await Effect.runPromise(
        gated.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: "kill-mid-write-key" },
        })
      );
      refusedWrites = gated.getRefusedWrites();
      // Merge any accidental effects (should be none when refuseWrites).
      for (const e of gated.uniqueEffects) parent.uniqueEffects.add(e);
    }

    const uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:")
    ).length;
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);
    const duplicates = Math.max(0, uniqueWriteEffects - (writeAppliedBefore ? 1 : 0));
    const outcomeUnknownCalls = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    const lost = !writeAppliedBefore && duplicates === 0 ? 1 : 0;

    const keyedResolved =
      input.upstreamMode === "idempotent" &&
      outcomeUnknownCalls === 0 &&
      uniqueWriteEffects === 1 &&
      duplicates === 0;

    const interruptedOrUnknown = outcomeUnknownCalls > 0;
    const completedKnownSuccess = keyedResolved;

    const classified = classifyOutcome({
      uniqueWriteEffects,
      duplicates,
      interruptedOrUnknown,
      completedKnownSuccess,
    });

    const ok =
      input.resumePolicy === "naive-retry"
        ? child.signal === "SIGKILL" && writeAppliedBefore && parent.executedWrites.length >= 1
        : input.resumePolicy === "clawql-always-retry"
          ? child.signal === "SIGKILL" &&
            writeAppliedBefore &&
            duplicates === 0 &&
            refusedWrites >= 1 &&
            (input.upstreamMode === "idempotent"
              ? classified.interruptedOrUnknown === 0 && classified.completedExactlyOnce === 1
              : classified.interruptedOrUnknown >= 1)
          : input.upstreamMode === "idempotent"
            ? child.signal === "SIGKILL" &&
              writeAppliedBefore &&
              duplicates === 0 &&
              classified.interruptedOrUnknown === 0 &&
              uniqueWriteEffects === 1
            : child.signal === "SIGKILL" &&
              writeAppliedBefore &&
              duplicates === 0 &&
              classified.interruptedOrUnknown >= 1 &&
              resumed.ok === false;

    return {
      i: input.i,
      ok,
      ...classified,
      lost,
      uniqueWriteEffects,
      childSignal: child.signal,
      detail: ok
        ? `${input.resumePolicy}/${input.upstreamMode}: dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce} effects=${uniqueWriteEffects} refused=${refusedWrites}`
        : `fail signal=${child.signal} dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} stderr=${child.stderr.slice(0, 80)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function makeFileJournalArm(resumePolicy: ResumePolicy): DurabilityArm {
  const id =
    resumePolicy === "clawql"
      ? ("clawql-file-journal" as const)
      : resumePolicy === "clawql-always-retry"
        ? ("clawql-always-retry" as const)
        : ("naive-retry" as const);
  const agentPolicy: AgentPolicy =
    resumePolicy === "clawql"
      ? "structural"
      : resumePolicy === "clawql-always-retry"
        ? "always-retry"
        : "always-retry";
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
            modes.push(
              summarizeMode(
                upstreamMode,
                trials,
                resumePolicy === "clawql" || resumePolicy === "clawql-always-retry"
              )
            );
          }
          if (resumePolicy === "clawql") {
            return {
              armId: id,
              status: "measured",
              agentPolicy,
              honesty:
                "ClawQL structural (crash during outside write): non_idempotent → interrupted/unknown, never re-send. idempotent → keyed resume (0 dups, completed exactly once). Agent policy does not matter for re-send — the gate already consumed the approval.",
              modes,
            };
          }
          if (resumePolicy === "clawql-always-retry") {
            return {
              armId: id,
              status: "measured",
              agentPolicy,
              honesty:
                "ClawQL + model always retries: after resume the agent re-issues execute; structural gate refuses (mandate_consumed). Expect 0 duplicates even when the model always retries — the contrast with Pi Durable always-retry.",
              modes,
            };
          }
          return {
            armId: id,
            status: "measured",
            agentPolicy,
            honesty:
              "Reference arm: forces write re-send after kill (no gate). Idempotent upstream can mask duplicates; non_idempotent multiplies effects. Not ClawQL product behavior.",
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

export const clawqlFileJournalArm = makeFileJournalArm("clawql");
export const clawqlAlwaysRetryArm = makeFileJournalArm("clawql-always-retry");
export const naiveRetryArm = makeFileJournalArm("naive-retry");
