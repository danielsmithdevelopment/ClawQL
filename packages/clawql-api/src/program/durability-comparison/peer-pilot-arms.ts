/**
 * Private pilot stand-ins for Pi Durable / Golem peer arms (COMPARISON.md).
 *
 * These encode published recovery semantics against the same mock upstreams as
 * the ClawQL arms. They are **not** live Golem Cloud / Pi Durable runs and do
 * **not** authorize a named public peer board (still needs maintainer invite).
 *
 * - **golem**: crash mid-HTTP → recovery re-sends with the same idempotency key
 *   (Golem 1.6 outbound HTTP). Idempotent upstream → one effect; non-idempotent → two.
 * - **pi-durable**: effectful tool default = not replay-safe → interrupted / unknown,
 *   no automatic re-execute (Pi Durable harness docs).
 * - **\*+clawql**: ClawQL as the tool layer — approval already consumed → no re-send,
 *   `outcome_unknown` (closes the non-idempotent case in Golem’s model).
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
  ArmId,
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
const IDEM_KEY = "kill-mid-write-key";

type PeerResumePolicy = "golem" | "pi-durable" | "clawql-gate";

function planSource(): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1, idempotencyKey: IDEM_KEY },
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

function recordingHost(opts: {
  readonly upstreamMode: UpstreamMode;
  readonly priorEffects: Set<string>;
}): { host: ProgramHost; executedWrites: string[]; uniqueEffects: Set<string> } {
  const executedWrites: string[] = [];
  const uniqueEffects = new Set(opts.priorEffects);
  let onceCounter = 0;
  for (const e of opts.priorEffects) {
    if (e.startsWith("once:")) onceCounter += 1;
  }
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
          reason: "durability-peer-pilot",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
          specLabel: "pets",
        },
      }),
  };
  return { host, executedWrites, uniqueEffects };
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

function armSlug(armId: ArmId): string {
  return armId.replace(/\+/g, "-plus-");
}

async function onePeerTrial(input: {
  readonly i: number;
  readonly upstreamMode: UpstreamMode;
  readonly policy: PeerResumePolicy;
  readonly armId: ArmId;
}): Promise<ComparisonTrial> {
  const slug = armSlug(input.armId);
  const dir = await mkdtemp(join(tmpdir(), `clawql-peer-${slug}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_peer_${slug}_${String(input.i).padStart(4, "0")}`;
  const sessionId = `peer-${slug}-${input.i}`;
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
    if (child.signal !== "SIGKILL") {
      return {
        i: input.i,
        ok: false,
        duplicates: 0,
        outcomeUnknown: 0,
        lost: 0,
        uniqueWriteEffects: 0,
        childSignal: child.signal,
        detail: `kill-worker did not SIGKILL (code=${child.code} signal=${child.signal}) stderr=${child.stderr.slice(0, 200)}`,
      };
    }
    let hostRaw = "";
    try {
      hostRaw = await readFile(hostLog, "utf8");
    } catch (e) {
      return {
        i: input.i,
        ok: false,
        duplicates: 0,
        outcomeUnknown: 0,
        lost: 0,
        uniqueWriteEffects: 0,
        childSignal: child.signal,
        detail: `missing host.log after SIGKILL: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const before = parseHostLog(hostRaw);
    const priorEffects = new Set(
      before.filter((l) => l.operationId === WRITE_OP && l.applied).map((l) => l.effectId)
    );
    const parent = recordingHost({
      upstreamMode: input.upstreamMode,
      priorEffects,
    });
    const writeAppliedBefore = before.some((l) => l.operationId === WRITE_OP && l.applied);

    let outcomeUnknown = 0;
    if (input.policy === "golem") {
      // Mid-flight HTTP recovery: re-send with the same idempotency key Golem adds.
      await Effect.runPromise(
        parent.host.execute({
          operationId: WRITE_OP,
          args: { page: 3, idempotencyKey: IDEM_KEY },
        })
      );
    } else if (input.policy === "pi-durable") {
      // Effectful tool not replay-safe: interrupted result, no automatic re-execute.
      outcomeUnknown = 1;
    } else {
      // ClawQL tool gate: journal resume → outcome_unknown, never re-send.
      const resumed = await Effect.runPromise(
        resumeProgramEffect(programId, parent.host, {}, { sessionId }).pipe(
          Effect.provide(programJournalFileLayer(dir))
        )
      );
      outcomeUnknown = resumed.calls.filter((c) => c.status === "outcome_unknown").length;
    }

    const duplicates = parent.executedWrites.length;
    const uniqueWriteEffects = [...parent.uniqueEffects].filter(
      (e) => e.startsWith("idem:") || e.startsWith("once:")
    ).length;
    const lost = !writeAppliedBefore && duplicates === 0 ? 1 : 0;

    const ok =
      child.signal === "SIGKILL" &&
      writeAppliedBefore &&
      (input.policy === "golem"
        ? duplicates === 1 &&
          (input.upstreamMode === "idempotent"
            ? uniqueWriteEffects === 1
            : uniqueWriteEffects === 2) &&
          outcomeUnknown === 0
        : duplicates === 0 && outcomeUnknown >= 1);

    return {
      i: input.i,
      ok,
      duplicates,
      outcomeUnknown,
      lost,
      uniqueWriteEffects,
      childSignal: child.signal,
      detail: ok
        ? `${input.armId}/${input.upstreamMode}: duplicates=${duplicates} unknown=${outcomeUnknown} effects=${uniqueWriteEffects}`
        : `fail signal=${child.signal} duplicates=${duplicates} unknown=${outcomeUnknown} effects=${uniqueWriteEffects} stderr=${child.stderr.slice(0, 80)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function summarizeMode(
  upstreamMode: UpstreamMode,
  trials: readonly ComparisonTrial[]
): ArmModeResult {
  const n = trials.length;
  const duplicates = trials.reduce((s, t) => s + t.duplicates, 0);
  const outcomeUnknown = trials.reduce((s, t) => s + t.outcomeUnknown, 0);
  const lost = trials.reduce((s, t) => s + t.lost, 0);
  const uniqueWriteEffects = trials.reduce((s, t) => s + t.uniqueWriteEffects, 0);
  const trialsOk = trials.filter((t) => t.ok).length;
  const trialsFailed = n - trialsOk;
  return {
    upstreamMode,
    n,
    duplicates,
    outcomeUnknown,
    lost,
    uniqueWriteEffects,
    trialsOk,
    trialsFailed,
    boardPass: trialsFailed === 0,
    trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
  };
}

function makePeerPilotArm(id: ArmId, policy: PeerResumePolicy, honesty: string): DurabilityArm {
  return {
    id,
    run: ({ n }) =>
      Effect.tryPromise({
        try: async (): Promise<ArmResult> => {
          const modes: ArmModeResult[] = [];
          for (const upstreamMode of ["idempotent", "non_idempotent"] as const) {
            const trials: ComparisonTrial[] = [];
            for (let i = 0; i < n; i++) {
              trials.push(await onePeerTrial({ i, upstreamMode, policy, armId: id }));
            }
            modes.push(summarizeMode(upstreamMode, trials));
          }
          return {
            armId: id,
            status: "pilot_standin",
            honesty,
            modes,
          };
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(Effect.orDie),
  };
}

const PILOT_PREFIX =
  "Private pilot stand-in (published recovery semantics × mock upstreams). Not a live peer runtime; named public board still needs maintainer invite. ";

export const piDurableArm = makePeerPilotArm(
  "pi-durable",
  "pi-durable",
  `${PILOT_PREFIX}Pi Durable: effectful tool not replay-safe → interrupted/unknown, no automatic re-execute.`
);

export const golemArm = makePeerPilotArm(
  "golem",
  "golem",
  `${PILOT_PREFIX}Golem: in-flight outbound HTTP re-sent with the same idempotency key. Keys → one effect; no keys → duplicate possible.`
);

export const piDurableClawqlArm = makePeerPilotArm(
  "pi-durable+clawql",
  "clawql-gate",
  `${PILOT_PREFIX}Pi Durable agent → ClawQL tools: single-use approval → outcome_unknown, never re-send.`
);

export const golemClawqlArm = makePeerPilotArm(
  "golem+clawql",
  "clawql-gate",
  `${PILOT_PREFIX}Golem agent → ClawQL tools: Golem retry becomes ClawQL refusal / outcome_unknown on non-idempotent APIs.`
);
