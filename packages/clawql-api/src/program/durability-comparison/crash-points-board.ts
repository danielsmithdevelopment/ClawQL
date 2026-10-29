/**
 * Companion board: ClawQL file-journal across crash-point rows.
 * Does not replace the peer fairness table (outside-write only) — fills the
 * other CrashPointId rows peers will ask about on first contact.
 */

import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resumeProgramEffect } from "../durable-runner.js";
import { programJournalFileLayer } from "../program-journal.js";
import type { ProgramHost } from "../program-runner.js";
import { apiCapabilityFor, classifyOutcome, summarizeMode } from "./metrics.js";
import type {
  ArmModeResult,
  ComparisonTrial,
  CrashPointId,
  TrialTraceEvent,
  UpstreamMode,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KILL_WORKER = join(HERE, "..", "durable-runner-kill-worker.ts");
const WRITE_OP = "owners.create";

type CrashPointSpec = {
  readonly id: CrashPointId;
  readonly killAt: string;
  readonly killPhase: "before_log" | "after_log";
  readonly planOps: readonly string[];
  readonly note: string;
  /** Expected product shape for clawql structural + neither (non_idempotent). */
  readonly expectNeither: "unknown" | "once";
  /** Expected for idempotent (keys). */
  readonly expectKeys: "once";
};

const CRASH_POINTS: readonly CrashPointSpec[] = [
  {
    id: "before_write_sent",
    killAt: WRITE_OP,
    killPhase: "before_log",
    planOps: ["pets.get", "pets.list", WRITE_OP],
    note: "SIGKILL before host log on write — request never visible upstream. Intent may already be journaled → neither stays unknown (at most once); keys → keyed resume 0/0/N.",
    expectNeither: "unknown",
    expectKeys: "once",
  },
  {
    id: "outside_write_in_flight",
    killAt: WRITE_OP,
    killPhase: "after_log",
    planOps: ["pets.get", "pets.list", WRITE_OP],
    note: "SIGKILL after host log, before return — hardest window (main peer board).",
    expectNeither: "unknown",
    expectKeys: "once",
  },
  {
    id: "after_write_acked",
    killAt: "pets.get.tail",
    killPhase: "before_log",
    planOps: ["pets.get", "pets.list", WRITE_OP, "pets.get.tail"],
    note: "Write completed and journaled; kill on trailing read before its host call → 0 dups / 0 unknown / once.",
    expectNeither: "once",
    expectKeys: "once",
  },
  {
    id: "idle_between_steps",
    killAt: "pets.list",
    killPhase: "before_log",
    planOps: ["pets.get", "pets.list", WRITE_OP],
    note: "Kill at start of second read after first call journaled — idle between durable steps; resume replays and finishes write once.",
    expectNeither: "once",
    expectKeys: "once",
  },
];

function planSource(ops: readonly string[]): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: ops.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1, idempotencyKey: "crash-point-key" },
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
        /* ignore */
      }
      return { operationId: line.trim(), effectId: line.trim(), applied: true };
    });
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

function recordingHost(
  upstreamMode: UpstreamMode,
  priorEffects: Set<string>
): { host: ProgramHost; uniqueEffects: Set<string> } {
  const uniqueEffects = new Set(priorEffects);
  let onceCounter = [...priorEffects].filter((e) => e.startsWith("once:")).length;
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        if (input.operationId === WRITE_OP) {
          const key =
            typeof input.args?.idempotencyKey === "string"
              ? input.args.idempotencyKey
              : `anon-${onceCounter + 1}`;
          if (upstreamMode === "idempotent") {
            const effectId = `idem:${key}`;
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
          reason: "crash-points",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
          specLabel: "pets",
        },
        idempotencyCapable: upstreamMode === "idempotent" && operationId === WRITE_OP,
      }),
  };
  return { host, uniqueEffects };
}

async function oneCrashPointTrial(input: {
  readonly i: number;
  readonly spec: CrashPointSpec;
  readonly upstreamMode: UpstreamMode;
}): Promise<ComparisonTrial> {
  const wantTrace = process.env.DURABILITY_COMPARISON_TRACE === "1";
  const events: TrialTraceEvent[] = [];
  const dir = await mkdtemp(join(tmpdir(), `clawql-cp-${input.spec.id}-${input.i}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_cp_${input.spec.id}_${String(input.i).padStart(4, "0")}`;
  try {
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: programId,
      SESSION_ID: `cp-${input.spec.id}-${input.i}`,
      SOURCE: planSource(input.spec.planOps),
      KILL_AT_OPERATION: input.spec.killAt,
      KILL_PHASE: input.spec.killPhase,
      WRITE_OPERATIONS: WRITE_OP,
      UPSTREAM_MODE: input.upstreamMode,
    });
    events.push({
      t: new Date().toISOString(),
      kind: "crashed",
      detail: `phase=${input.spec.id} killAt=${input.spec.killAt} killPhase=${input.spec.killPhase} signal=${child.signal}`,
    });

    const before = parseHostLog(await readFile(hostLog, "utf8").catch(() => ""));
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);
    if (writeAppliedBefore) {
      events.push({
        t: new Date().toISOString(),
        kind: "request_applied",
        reference: "crash-point-key",
        detail: before.find((l) => l.operationId === WRITE_OP)?.effectId,
      });
    } else if (input.spec.killPhase === "before_log" && input.spec.killAt === WRITE_OP) {
      events.push({
        t: new Date().toISOString(),
        kind: "intent_journaled",
        reference: "crash-point-key",
        detail: "before_write_sent",
      });
    }

    const priorEffects = new Set(
      before.filter((l) => l.operationId === WRITE_OP && l.applied).map((l) => l.effectId)
    );
    const parent = recordingHost(input.upstreamMode, priorEffects);
    const resumed = await Effect.runPromise(
      resumeProgramEffect(
        programId,
        parent.host,
        {},
        { sessionId: `cp-${input.spec.id}-${input.i}` }
      ).pipe(Effect.provide(programJournalFileLayer(dir)))
    );
    events.push({ t: new Date().toISOString(), kind: "resumed" });

    const uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:")
    ).length;
    const duplicates = uniqueWriteEffects > 0 ? Math.max(0, uniqueWriteEffects - 1) : 0;
    const outcomeUnknownCalls = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    const interruptedOrUnknown = outcomeUnknownCalls > 0;
    if (interruptedOrUnknown) {
      events.push({ t: new Date().toISOString(), kind: "outcome_unknown" });
    } else if (uniqueWriteEffects === 1) {
      events.push({
        t: new Date().toISOString(),
        kind: "reconciled",
        reference: "crash-point-key",
        detail: input.upstreamMode === "idempotent" ? "idempotency_key" : "completed",
      });
    }

    const completedKnownSuccess =
      !interruptedOrUnknown && uniqueWriteEffects === 1 && resumed.ok === true;
    const classified = classifyOutcome({
      uniqueWriteEffects,
      duplicates,
      interruptedOrUnknown,
      completedKnownSuccess,
    });

    const expect =
      input.upstreamMode === "idempotent" ? input.spec.expectKeys : input.spec.expectNeither;
    const ok =
      child.signal === "SIGKILL" &&
      classified.duplicates === 0 &&
      (expect === "once"
        ? classified.completedExactlyOnce === 1 && classified.interruptedOrUnknown === 0
        : classified.interruptedOrUnknown === 1 && classified.completedExactlyOnce === 0);

    return {
      i: input.i,
      ok,
      ...classified,
      lost: !writeAppliedBefore && uniqueWriteEffects === 0 ? 1 : 0,
      uniqueWriteEffects,
      childSignal: child.signal,
      detail: ok
        ? `${input.spec.id}/${input.upstreamMode}: dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce}`
        : `fail ${input.spec.id}/${input.upstreamMode} signal=${child.signal} dup=${classified.duplicates} unk=${classified.interruptedOrUnknown} once=${classified.completedExactlyOnce} effects=${uniqueWriteEffects} writeBefore=${writeAppliedBefore} stderr=${child.stderr.slice(0, 60)}`,
      ...(wantTrace ? { events } : {}),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type CrashPointRow = {
  readonly crashPoint: CrashPointId;
  readonly note: string;
  readonly modes: readonly ArmModeResult[];
};

export type CrashPointsEvidence = {
  readonly kind: "durability-comparison-crash-points";
  readonly measuredAt: string;
  readonly honesty: string;
  readonly skippedCrashPoints: readonly CrashPointId[];
  readonly rows: readonly CrashPointRow[];
};

export function runCrashPointsBoardEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CrashPointsEvidence> {
  const raw =
    env.DURABILITY_COMPARISON_CRASH_POINTS_N?.trim() || env.DURABILITY_COMPARISON_N?.trim();
  const n = raw ? Math.min(100, Math.max(1, Math.floor(Number(raw)))) : 5;
  if (!Number.isFinite(n)) {
    return Effect.die(new Error("DURABILITY_COMPARISON_CRASH_POINTS_N must be a positive int"));
  }

  return Effect.tryPromise({
    try: async (): Promise<CrashPointsEvidence> => {
      const rows: CrashPointRow[] = [];
      for (const spec of CRASH_POINTS) {
        const modes: ArmModeResult[] = [];
        for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
          const trials: ComparisonTrial[] = [];
          for (let i = 0; i < n; i++) {
            trials.push(await oneCrashPointTrial({ i, spec, upstreamMode }));
          }
          modes.push(
            summarizeMode(upstreamMode, trials, {
              requireZeroDuplicates: true,
              apiCapability: apiCapabilityFor({ upstreamMode }),
            })
          );
        }
        rows.push({ crashPoint: spec.id, note: spec.note, modes });
      }
      return {
        kind: "durability-comparison-crash-points",
        measuredAt: new Date().toISOString(),
        honesty:
          "ClawQL file-journal only (structural). Companion to the peer outside-write board — fills before_write_sent / after_write_acked / idle_between_steps. during_model_tool_round is peer-specific and skipped. neither + before_write_sent / outside_write stay unknown (intent journaled, no blind resend).",
        skippedCrashPoints: ["during_model_tool_round"],
        rows,
      };
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  }).pipe(Effect.orDie);
}

export function defaultCrashPointsEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DURABILITY_COMPARISON_CRASH_POINTS_PATH?.trim()) {
    return env.DURABILITY_COMPARISON_CRASH_POINTS_PATH.trim();
  }
  return join(
    process.cwd(),
    "docs/benchmarks/durability-proof/comparison/crash-points-evidence.json"
  );
}

export function writeCrashPointsEvidence(
  evidence: CrashPointsEvidence,
  path: string = defaultCrashPointsEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}
