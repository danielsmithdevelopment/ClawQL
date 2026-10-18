/**
 * Local ADR 0015 kill-node stand-in demo (file-journal SIGKILL).
 *
 * Honesty: proves the durable program resume contract after real SIGKILL of the
 * runner process. Does **not** prove celld V8-isolate / SQLite-LTX crash survival
 * — that still needs ProgramCellDO + SIGKILL of the celld binary.
 *
 * Three arms (read interrupt, write interrupt → outcome_unknown, pin report):
 *   npm run demo:kill-node-standin
 */

import { fork } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resumeProgramEffect } from "./durable-runner.js";
import { programJournalFileLayer } from "./program-journal.js";
import type { ProgramHost } from "./program-runner.js";
import { celldPinStatusEffect } from "./celld-pin.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KILL_WORKER = join(HERE, "durable-runner-kill-worker.ts");
const PROGRAM_ID = "prog_killnode_standin01";
const READ_OPS = ["pets.get", "pets.list", "owners.list"] as const;
const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;

export type KillNodeStandinArmResult = {
  readonly arm: "read_sigkill_resume" | "write_sigkill_outcome_unknown";
  readonly ok: boolean;
  readonly childSignal: string | null;
  readonly hostCallsBeforeKill: readonly string[];
  readonly hostCallsAfterResume: readonly string[];
  readonly detail: string;
};

export type KillNodeStandinEvidence = {
  readonly kind: "file-journal-sigkill-standin";
  readonly measuredAt: string;
  readonly honesty: string;
  readonly arms: readonly KillNodeStandinArmResult[];
  readonly pin: {
    readonly isolateReady: boolean;
    readonly isolateKillNodeEligible: boolean;
    readonly honesty: string;
  };
  readonly ok: boolean;
};

function planSource(ops: readonly string[]): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: ops.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1 },
    })),
  });
}

function recordingHost(writes: readonly string[] = []): {
  host: ProgramHost;
  executed: string[];
} {
  const executed: string[] = [];
  const writeSet = new Set(writes);
  const host: ProgramHost = {
    execute: (input) =>
      Effect.sync(() => {
        executed.push(input.operationId);
        const body = { ok: true, operationId: input.operationId, args: input.args };
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
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
          reason: "kill-node-standin",
        },
        operation: {
          method: writeSet.has(operationId) ? "POST" : "GET",
          specLabel: "pets",
        },
      }),
  };
  return { host, executed };
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

async function armReadSigkill(): Promise<KillNodeStandinArmResult> {
  const dir = await mkdtemp(join(tmpdir(), "clawql-kill-standin-read-"));
  const hostLog = join(dir, "host.log");
  const child = await runKillWorker({
    JOURNAL_DIR: dir,
    HOST_LOG: hostLog,
    PROGRAM_ID,
    SESSION_ID: "kill-standin-read",
    SOURCE: planSource(READ_OPS),
    KILL_AT_OPERATION: "owners.list",
  });
  const before = (await readFile(hostLog, "utf8")).trim().split("\n").filter(Boolean);
  const parent = recordingHost();
  const resumed = await Effect.runPromise(
    resumeProgramEffect(PROGRAM_ID, parent.host, {}, { sessionId: "kill-standin-read" }).pipe(
      Effect.provide(programJournalFileLayer(dir))
    )
  );
  const ok =
    child.signal === "SIGKILL" &&
    before.join(",") === READ_OPS.join(",") &&
    parent.executed.join(",") === "owners.list" &&
    resumed.ok === true &&
    resumed.calls.slice(0, 2).every((c) => c.replayed === true);
  return {
    arm: "read_sigkill_resume",
    ok,
    childSignal: child.signal,
    hostCallsBeforeKill: before,
    hostCallsAfterResume: parent.executed,
    detail: ok
      ? "SIGKILL mid-read; resume replayed 2 journaled calls and re-ran interrupted read once"
      : `fail signal=${child.signal} before=${before.join("|")} after=${parent.executed.join("|")} resumed.ok=${resumed.ok} stderr=${child.stderr.slice(0, 200)}`,
  };
}

async function armWriteSigkill(): Promise<KillNodeStandinArmResult> {
  const dir = await mkdtemp(join(tmpdir(), "clawql-kill-standin-write-"));
  const hostLog = join(dir, "host.log");
  const child = await runKillWorker({
    JOURNAL_DIR: dir,
    HOST_LOG: hostLog,
    PROGRAM_ID,
    SESSION_ID: "kill-standin-write",
    SOURCE: planSource(WRITE_OPS),
    KILL_AT_OPERATION: "owners.create",
    WRITE_OPERATIONS: "owners.create",
  });
  const before = (await readFile(hostLog, "utf8")).trim().split("\n").filter(Boolean);
  const parent = recordingHost(["owners.create"]);
  const resumed = await Effect.runPromise(
    resumeProgramEffect(PROGRAM_ID, parent.host, {}, { sessionId: "kill-standin-write" }).pipe(
      Effect.provide(programJournalFileLayer(dir))
    )
  );
  const ok =
    child.signal === "SIGKILL" &&
    before.join(",") === WRITE_OPS.join(",") &&
    parent.executed.length === 0 &&
    resumed.ok === false &&
    resumed.calls[2]?.status === "outcome_unknown";
  return {
    arm: "write_sigkill_outcome_unknown",
    ok,
    childSignal: child.signal,
    hostCallsBeforeKill: before,
    hostCallsAfterResume: parent.executed,
    detail: ok
      ? "SIGKILL mid-write; resume reports outcome_unknown and does not re-send write"
      : `fail signal=${child.signal} after=${parent.executed.join("|")} status=${resumed.calls[2]?.status} stderr=${child.stderr.slice(0, 200)}`,
  };
}

export function runKillNodeStandinDemoEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<KillNodeStandinEvidence> {
  return Effect.gen(function* () {
    const pin = yield* celldPinStatusEffect(env);
    const readArm = yield* Effect.tryPromise({
      try: () => armReadSigkill(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const writeArm = yield* Effect.tryPromise({
      try: () => armWriteSigkill(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const arms = [readArm, writeArm] as const;
    const ok = arms.every((a) => a.ok);
    return {
      kind: "file-journal-sigkill-standin" as const,
      measuredAt: new Date().toISOString(),
      honesty:
        "File-journal SIGKILL stand-in for ADR 0015. Not celld isolate kill-node — ProgramCellDO + SIGKILL celld binary still required for crash-survival claims.",
      arms,
      pin: {
        isolateReady: pin.isolateReady,
        isolateKillNodeEligible: pin.isolateReady,
        honesty: pin.honesty,
      },
      ok,
    };
  });
}

export function defaultKillNodeEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CLAWQL_KILL_NODE_EVIDENCE_PATH?.trim()) {
    return env.CLAWQL_KILL_NODE_EVIDENCE_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/program-kill-node-standin/evidence.json");
}

export function writeKillNodeStandinEvidence(
  evidence: KillNodeStandinEvidence,
  path: string = defaultKillNodeEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

export function loadKillNodeStandinEvidence(
  path: string = defaultKillNodeEvidencePath()
): KillNodeStandinEvidence | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as KillNodeStandinEvidence;
  } catch {
    return null;
  }
}
