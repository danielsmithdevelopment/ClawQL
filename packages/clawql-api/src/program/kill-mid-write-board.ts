/**
 * Kill-mid-write durability board (security suite Tier D).
 *
 * Runs N file-journal SIGKILL trials on a write intent: resume must report
 * `outcome_unknown` and must not re-send the write (duplicate_side_effects = 0).
 *
 * Honesty: proves the durable program journal contract under process kill.
 * Does not prove celld fleet LTX or mandate park/consume across replicas.
 */

import { fork } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { resumeProgramEffect } from "./durable-runner.js";
import { programJournalFileLayer } from "./program-journal.js";
import type { ProgramHost } from "./program-runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const KILL_WORKER = join(HERE, "durable-runner-kill-worker.ts");
const WRITE_OPS = ["pets.get", "pets.list", "owners.create"] as const;
const WRITE_OP = "owners.create";

export type KillMidWriteTrial = {
  readonly i: number;
  readonly ok: boolean;
  readonly duplicateSideEffects: number;
  readonly childSignal: string | null;
  readonly detail: string;
};

export type KillMidWriteEvidence = {
  readonly kind: "kill-mid-write-file-journal";
  readonly measuredAt: string;
  readonly n: number;
  readonly duplicateSideEffects: number;
  readonly trialsOk: number;
  readonly trialsFailed: number;
  readonly boardPass: boolean;
  readonly honesty: string;
  readonly metric: "duplicate_side_effects == 0";
  readonly trials: readonly KillMidWriteTrial[];
};

function planSource(): string {
  return JSON.stringify({
    v: 1,
    mode: "sequential",
    calls: WRITE_OPS.map((operationId, i) => ({
      tool: "execute",
      operationId,
      args: { page: i + 1 },
    })),
  });
}

function recordingHost(): { host: ProgramHost; executed: string[] } {
  const executed: string[] = [];
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
          reason: "kill-mid-write",
        },
        operation: {
          method: operationId === WRITE_OP ? "POST" : "GET",
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

async function oneTrial(i: number): Promise<KillMidWriteTrial> {
  const dir = await mkdtemp(join(tmpdir(), `clawql-kill-mid-${i}-`));
  const hostLog = join(dir, "host.log");
  const programId = `prog_killmid_${String(i).padStart(4, "0")}`;
  const sessionId = `kill-mid-${i}`;
  try {
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: programId,
      SESSION_ID: sessionId,
      SOURCE: planSource(),
      KILL_AT_OPERATION: WRITE_OP,
      WRITE_OPERATIONS: WRITE_OP,
    });
    const before = (await readFile(hostLog, "utf8")).trim().split("\n").filter(Boolean);
    const parent = recordingHost();
    const resumed = await Effect.runPromise(
      resumeProgramEffect(programId, parent.host, {}, { sessionId }).pipe(
        Effect.provide(programJournalFileLayer(dir))
      )
    );
    const duplicates = parent.executed.filter((op) => op === WRITE_OP).length;
    const ok =
      child.signal === "SIGKILL" &&
      before.includes(WRITE_OP) &&
      duplicates === 0 &&
      resumed.ok === false &&
      resumed.calls.some((c) => c.status === "outcome_unknown");
    return {
      i,
      ok,
      duplicateSideEffects: duplicates,
      childSignal: child.signal,
      detail: ok
        ? "SIGKILL mid-write; resume outcome_unknown; write not re-sent"
        : `fail signal=${child.signal} duplicates=${duplicates} status=${resumed.calls.find((c) => c.status)?.status ?? "?"} stderr=${child.stderr.slice(0, 120)}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function parseKillMidWriteN(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.KILL_MID_WRITE_N?.trim();
  if (!raw) return 50;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) {
    throw new Error(`KILL_MID_WRITE_N must be 1..10000 (got ${raw})`);
  }
  return Math.floor(n);
}

export function runKillMidWriteBoardEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<KillMidWriteEvidence> {
  const n = parseKillMidWriteN(env);
  return Effect.tryPromise({
    try: async () => {
      const trials: KillMidWriteTrial[] = [];
      for (let i = 0; i < n; i++) {
        trials.push(await oneTrial(i));
      }
      const duplicateSideEffects = trials.reduce((s, t) => s + t.duplicateSideEffects, 0);
      const trialsOk = trials.filter((t) => t.ok).length;
      const trialsFailed = n - trialsOk;
      const boardPass = duplicateSideEffects === 0 && trialsFailed === 0;
      return {
        kind: "kill-mid-write-file-journal" as const,
        measuredAt: new Date().toISOString(),
        n,
        duplicateSideEffects,
        trialsOk,
        trialsFailed,
        boardPass,
        metric: "duplicate_side_effects == 0" as const,
        honesty:
          "File-journal kill-mid-write board (Tier D). Counts write re-sends after SIGKILL+resume. Not mandate park/consume across replicas; not celld fleet LTX.",
        // Keep evidence small in CI: summarize failures only when N is large
        trials: n <= 100 ? trials : trials.filter((t) => !t.ok).slice(0, 20),
      };
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  }).pipe(Effect.orDie);
}

export function defaultKillMidWriteEvidencePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.KILL_MID_WRITE_EVIDENCE_PATH?.trim()) {
    return env.KILL_MID_WRITE_EVIDENCE_PATH.trim();
  }
  return join(process.cwd(), "docs/benchmarks/security-suite/kill-mid-write/evidence.json");
}

export function writeKillMidWriteEvidence(
  evidence: KillMidWriteEvidence,
  path: string = defaultKillMidWriteEvidencePath()
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}
