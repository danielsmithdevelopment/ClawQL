import { fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Clock, Deferred, Duration, Effect, Exit, Layer, Result } from "effect";
import { describe, expect, it } from "vitest";
import {
  DURABLE_PROGRAM_HONESTY,
  DurableProgramRunnerLive,
  DurableProgramRunnerService,
  executeDurableProgramEffect,
  NONDET_STARTED_AT,
  ProgramCrashSimulated,
  resumeProgramEffect,
  runDurableProgramEffect,
  type DurableProgramInput,
} from "./durable-runner.js";
import {
  makeFileProgramJournalEffect,
  programJournalFileLayer,
  type ProgramJournal,
  type ProgramJournalService,
} from "./program-journal.js";
import {
  durableProgramsEnabled,
  programsEnabled,
  ProgramModeLive,
  ProgramModeService,
} from "./program-mode.js";
import {
  runProgramEffect,
  type ExecuteProgramResult,
  type ProgramCallRecord,
  type ProgramHost,
  type ProgramReplayedCall,
} from "./program-runner.js";

const ID = "prog_durabletest01";
const OPS = ["pets.get", "pets.list", "owners.list"] as const;
const WRITE_PLAN_OPS = ["pets.get", "pets.list", "owners.create"] as const;

function planSource(
  mode: "sequential" | "parallel" = "sequential",
  ops: readonly string[] = OPS
): string {
  return JSON.stringify({
    v: 1,
    mode,
    calls: ops.map((operationId, i) => ({ tool: "execute", operationId, args: { page: i + 1 } })),
  });
}

const SOURCE = planSource();

type HostOptions = {
  /** Operations that are writes (POST, policy allow). */
  readonly writes?: readonly string[];
  /** Per-operation latency, to land a timeout mid-call. */
  readonly delayMs?: Readonly<Record<string, number>>;
  readonly failReplayed?: boolean;
  /** Runs inside the host call, before it returns. */
  readonly onExecute?: (operationId: string) => Effect.Effect<void>;
};

type RecordingHost = {
  readonly host: ProgramHost;
  readonly executed: string[];
  readonly replayed: ProgramReplayedCall[];
};

/** Same response shape as durable-runner-kill-worker.ts, so results compare across processes. */
function recordingHost(options: HostOptions = {}): RecordingHost {
  const executed: string[] = [];
  const replayed: ProgramReplayedCall[] = [];
  const writes = new Set(options.writes ?? []);
  const host: ProgramHost = {
    execute: (input) =>
      Effect.gen(function* () {
        executed.push(input.operationId);
        if (options.onExecute) yield* options.onExecute(input.operationId);
        const delay = options.delayMs?.[input.operationId];
        if (delay !== undefined) yield* Effect.sleep(Duration.millis(delay));
        const body = { ok: true, operationId: input.operationId, args: input.args };
        return { content: [{ type: "text" as const, text: JSON.stringify(body) }] };
      }),
    search: (input) =>
      Effect.succeed({ formattedText: JSON.stringify({ ok: true, query: input.query }) }),
    resolveRisk: (operationId) =>
      Effect.succeed({
        found: true,
        policy: "allow" as const,
        risk: {
          policy: "allow" as const,
          level: "LOW" as const,
          source: "spec-default" as const,
          reason: "test",
        },
        operation: { method: writes.has(operationId) ? "POST" : "GET", specLabel: "pets" },
      }),
    replayed: (call) =>
      options.failReplayed
        ? Effect.fail(new Error("labels unavailable"))
        : Effect.sync(() => {
            replayed.push(call);
          }),
  };
  return { host, executed, replayed };
}

const tempDir = () => mkdtemp(join(tmpdir(), "clawql-durable-"));

function inJournal<A, E>(
  dir: string,
  effect: Effect.Effect<A, E, ProgramJournalService>
): Promise<A> {
  return Effect.runPromise(Effect.provide(effect, programJournalFileLayer(dir)));
}

const run = (dir: string, input: DurableProgramInput, host: ProgramHost) =>
  inJournal(dir, runDurableProgramEffect(input, host, {}));

const resume = (dir: string, host: ProgramHost, sessionId?: string) =>
  inJournal(dir, resumeProgramEffect(ID, host, {}, { sessionId }));

function loadJournal(dir: string): Promise<ProgramJournal | null> {
  return Effect.runPromise(Effect.flatMap(makeFileProgramJournalEffect(dir), (j) => j.load(ID)));
}

async function journalRecords(dir: string): Promise<Array<{ readonly t: string }>> {
  const text = await readFile(join(dir, `${ID}.jsonl`), "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { t: string });
}

/** First attempt dies (simulated crash) once `afterCalls` calls are journaled. */
async function crashAfter(
  dir: string,
  host: ProgramHost,
  afterCalls: number,
  input: DurableProgramInput = { source: SOURCE, programId: ID }
): Promise<void> {
  const exit = await Effect.runPromiseExit(
    Effect.provide(
      runDurableProgramEffect(input, host, {}, { simulateCrashAfterCalls: afterCalls }),
      programJournalFileLayer(dir)
    )
  );
  const defect = Exit.findDefect(exit);
  expect(Result.isSuccess(defect) && defect.success).toBeInstanceOf(ProgramCrashSimulated);
}

/** A plain (non-durable) v0 run of `source`: what a resumed program must return. */
function baseline(source = SOURCE): Promise<ExecuteProgramResult> {
  return Effect.runPromise(runProgramEffect({ source }, recordingHost().host, {}));
}

/** Call records minus per-run fields (programId) and replay markers. */
function comparable(calls: readonly ProgramCallRecord[]) {
  return calls.map((c) => ({
    index: c.index,
    tool: c.tool,
    operationId: c.operationId,
    ok: c.ok,
    status: c.status,
    error: c.error,
    resultPreview: c.resultPreview,
  }));
}

/** Pin wall-clock reads to `iso`; sleeps and timeouts still use the real clock. */
const atTime =
  (iso: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const real = yield* Clock.Clock;
      const ms = Date.parse(iso);
      const pinned: Clock.Clock = {
        currentTimeMillisUnsafe: () => ms,
        currentTimeMillis: Effect.succeed(ms),
        currentTimeNanosUnsafe: () => BigInt(ms) * 1_000_000n,
        currentTimeNanos: Effect.succeed(BigInt(ms) * 1_000_000n),
        monotonicTimeNanosUnsafe: () => real.monotonicTimeNanosUnsafe(),
        monotonicTimeNanos: real.monotonicTimeNanos,
        sleep: (duration) => real.sleep(duration),
      };
      return yield* Effect.provideService(effect, Clock.Clock, pinned);
    });

describe("durable programs: crash and resume (ADR 0015 step 2)", () => {
  it("crash after two of three sequential executes: resume replays both and executes only the third", async () => {
    const dir = await tempDir();
    const expected = await baseline();

    const first = recordingHost();
    await crashAfter(dir, first.host, 2);
    expect(first.executed).toEqual(["pets.get", "pets.list"]);
    const crashed = await loadJournal(dir);
    expect(crashed).toMatchObject({ status: "running", intents: [] });
    expect(crashed?.entries.map((e) => e.index)).toEqual([0, 1]);

    const second = recordingHost();
    const resumed = await resume(dir, second.host);
    expect(second.executed).toEqual(["owners.list"]);
    expect(second.replayed).toEqual([
      { index: 0, tool: "execute", operationId: "pets.get", ok: true },
      { index: 1, tool: "execute", operationId: "pets.list", ok: true },
    ]);
    expect(resumed.ok).toBe(true);
    expect(resumed.programId).toBe(ID);
    expect(resumed.result).toEqual(expected.result);
    expect(comparable(resumed.calls)).toEqual(comparable(expected.calls));
    expect(resumed.calls.map((c) => c.replayed)).toEqual([true, true, undefined]);
    expect(resumed.diagnostics.honesty).toBe(DURABLE_PROGRAM_HONESTY);
    expect(resumed.diagnostics.durable).toMatchObject({
      backend: "file-jsonl",
      status: "completed",
      resumed: true,
      replayedCalls: 2,
      executedCalls: 1,
      outcomeUnknownCalls: 0,
      journaledCalls: 3,
    });
    expect((await loadJournal(dir))?.status).toBe("completed");
  });

  it("resuming a completed program replays its result with no host calls and no journal writes", async () => {
    const dir = await tempDir();
    const first = await run(dir, { source: SOURCE, programId: ID }, recordingHost().host);
    expect(first.ok).toBe(true);
    expect(first.diagnostics.durable).toMatchObject({ resumed: false, executedCalls: 3 });
    const bytes = await readFile(join(dir, `${ID}.jsonl`));

    const again = recordingHost();
    const replay = await resume(dir, again.host);
    expect(again.executed).toEqual([]);
    expect(replay.result).toEqual(first.result);
    expect(replay.diagnostics.durable).toMatchObject({
      status: "completed",
      resumed: true,
      replayedCalls: 3,
      executedCalls: 0,
      journaledCalls: 3,
    });
    expect(await readFile(join(dir, `${ID}.jsonl`))).toEqual(bytes);
  });

  it("a timeout parks the program with the calls that landed; resume re-runs only the interrupted read", async () => {
    const dir = await tempDir();
    const slow = recordingHost({ delayMs: { "owners.list": 10_000 } });
    const parked = await run(dir, { source: SOURCE, programId: ID, timeoutMs: 100 }, slow.host);
    expect(slow.executed).toEqual([...OPS]);
    expect(parked.ok).toBe(false);
    expect(parked.diagnostics).toMatchObject({
      timedOut: true,
      durable: { status: "parked", executedCalls: 2, journaledCalls: 2 },
    });
    expect(parked.diagnostics.fixHint).toMatch(/Resume with execute_program \{ programId \}/);
    expect(parked.calls.map((c) => c.operationId)).toEqual(["pets.get", "pets.list"]);
    expect((await loadJournal(dir))?.status).toBe("parked");

    const fast = recordingHost();
    const resumed = await resume(dir, fast.host);
    expect(fast.executed).toEqual(["owners.list"]);
    expect(resumed.ok).toBe(true);
    expect(resumed.result).toEqual((await baseline()).result);
  });

  it("journals an intent before a write reaches the host; a write in flight resumes as outcome_unknown, never re-run", async () => {
    const dir = await tempDir();
    const source = planSource("sequential", WRITE_PLAN_OPS);
    let intentBeforeHost = false;
    const slow = recordingHost({
      writes: ["owners.create"],
      delayMs: { "owners.create": 10_000 },
      onExecute: (operationId) =>
        Effect.sync(() => {
          if (operationId !== "owners.create") return;
          intentBeforeHost = readFileSync(join(dir, `${ID}.jsonl`), "utf8").includes(
            '"t":"intent"'
          );
        }),
    });
    const parked = await run(dir, { source, programId: ID, timeoutMs: 100 }, slow.host);
    expect(parked.diagnostics.durable?.status).toBe("parked");
    expect(intentBeforeHost).toBe(true);
    expect((await loadJournal(dir))?.intents).toMatchObject([
      { index: 2, callId: "call_2", operationId: "owners.create" },
    ]);

    const again = recordingHost({ writes: ["owners.create"] });
    const resumed = await resume(dir, again.host);
    expect(again.executed).toEqual([]);
    expect(resumed.ok).toBe(false);
    expect(resumed.calls[2]).toMatchObject({
      operationId: "owners.create",
      ok: false,
      status: "outcome_unknown",
    });
    expect(resumed.diagnostics.durable).toMatchObject({
      status: "completed",
      replayedCalls: 2,
      executedCalls: 0,
      outcomeUnknownCalls: 1,
      journaledCalls: 3,
    });

    const third = recordingHost({ writes: ["owners.create"] });
    const replay = await resume(dir, third.host);
    expect(third.executed).toEqual([]);
    expect(replay.calls[2]).toMatchObject({ status: "outcome_unknown", replayed: true });
    expect(replay.result).toEqual(resumed.result);
  });

  it("a write that completed before the crash replays its journaled result", async () => {
    const dir = await tempDir();
    const source = planSource("sequential", ["owners.create", "pets.list"]);
    const first = recordingHost({ writes: ["owners.create"] });
    await crashAfter(dir, first.host, 1, { source, programId: ID });
    expect(first.executed).toEqual(["owners.create"]);
    expect((await loadJournal(dir))?.intents.map((i) => i.index)).toEqual([0]);

    const again = recordingHost({ writes: ["owners.create"] });
    const resumed = await resume(dir, again.host);
    expect(again.executed).toEqual(["pets.list"]);
    expect(resumed.ok).toBe(true);
    expect(resumed.calls[0]).toMatchObject({ ok: true, replayed: true });
  });

  it("parallel plans journal each call as it settles; resume runs only what did not land", async () => {
    const dir = await tempDir();
    const source = planSource("parallel");
    await crashAfter(dir, recordingHost().host, 2, { source, programId: ID });
    const landed = (await loadJournal(dir))?.entries.length ?? 0;
    expect(landed).toBeGreaterThanOrEqual(2);

    const again = recordingHost();
    const resumed = await resume(dir, again.host);
    expect(again.executed).toHaveLength(OPS.length - landed);
    expect(resumed.ok).toBe(true);
    expect(resumed.result).toEqual((await baseline(source)).result);
  });

  it("journals clock.startedAt once and replays it on every attempt", async () => {
    const dir = await tempDir();
    const t1 = "2026-10-09T08:00:00.000Z";
    const t2 = "2026-10-09T09:30:00.000Z";
    await Effect.runPromiseExit(
      Effect.provide(
        atTime(t1)(
          runDurableProgramEffect(
            { source: SOURCE, programId: ID },
            recordingHost().host,
            {},
            { simulateCrashAfterCalls: 1 }
          )
        ),
        programJournalFileLayer(dir)
      )
    );
    const resumed = await inJournal(
      dir,
      atTime(t2)(resumeProgramEffect(ID, recordingHost().host, {}))
    );
    expect(resumed.diagnostics.durable?.startedAt).toBe(t1);
    const journal = await loadJournal(dir);
    expect(journal?.nondet).toEqual([{ key: NONDET_STARTED_AT, value: t1 }]);
    expect(journal?.entries.map((e) => e.completedAt)).toEqual([t1, t2, t2]);
    expect((await journalRecords(dir)).filter((r) => r.t === "nondet")).toHaveLength(1);
  });

  it("re-labels replayed calls through host.replayed and withholds results it cannot label", async () => {
    const dir = await tempDir();
    await crashAfter(dir, recordingHost().host, 2);

    const unlabeled = recordingHost({ failReplayed: true });
    const refused = await resume(dir, unlabeled.host);
    expect(refused).toMatchObject({
      ok: false,
      result: null,
      calls: [],
      diagnostics: { code: "replay_label_failed", durable: { status: "running" } },
    });
    expect(unlabeled.executed).toEqual([]);
    expect((await loadJournal(dir))?.status).toBe("running");

    const labeled = recordingHost();
    const resumed = await resume(dir, labeled.host);
    expect(resumed.ok).toBe(true);
    expect(labeled.replayed.map((c) => c.index)).toEqual([0, 1]);
    expect(labeled.executed).toEqual(["owners.list"]);
  });

  it("only the session that created a program can resume it", async () => {
    const dir = await tempDir();
    await crashAfter(dir, recordingHost().host, 1, {
      source: SOURCE,
      programId: ID,
      sessionId: "alice",
    });

    const bob = recordingHost();
    const denied = await resume(dir, bob.host, "bob");
    expect(denied).toMatchObject({ ok: false, diagnostics: { code: "program_not_found" } });
    expect(bob.executed).toEqual([]);

    const alice = recordingHost();
    const resumed = await resume(dir, alice.host, "alice");
    expect(resumed.ok).toBe(true);
    expect(alice.executed).toEqual(["pets.list", "owners.list"]);
  });

  it("refuses requests it cannot honour without touching the host", async () => {
    const dir = await tempDir();
    const host = recordingHost();
    expect(await run(dir, {}, host.host)).toMatchObject({
      ok: false,
      diagnostics: { code: "program_source_required" },
    });
    expect(await run(dir, { programId: "../../etc/passwd" }, host.host)).toMatchObject({
      ok: false,
      programId: "",
      diagnostics: { code: "invalid_program_id" },
    });
    expect(await run(dir, { programId: ID }, host.host)).toMatchObject({
      ok: false,
      diagnostics: { code: "program_not_found" },
    });
    expect(await run(dir, { source: "await execute()", programId: ID }, host.host)).toMatchObject({
      ok: false,
      diagnostics: { code: "invalid_plan" },
    });
    expect(await loadJournal(dir)).toBeNull();
    expect(host.executed).toEqual([]);

    await crashAfter(dir, host.host, 1);
    expect(
      await run(dir, { source: planSource("parallel"), programId: ID }, host.host)
    ).toMatchObject({ ok: false, diagnostics: { code: "program_source_mismatch" } });
    expect(
      await inJournal(
        dir,
        resumeProgramEffect(ID, host.host, { CLAWQL_PROGRAM_MAX_TOOL_CALLS: "2" })
      )
    ).toMatchObject({ ok: false, diagnostics: { code: "invalid_plan" } });
    expect(host.executed).toEqual(["pets.get"]);

    const resumed = await run(dir, { source: SOURCE, programId: ID }, host.host);
    expect(resumed).toMatchObject({
      ok: true,
      diagnostics: { durable: { resumed: true, replayedCalls: 1, executedCalls: 2 } },
    });
  });

  it("refuses a second attempt while one is running", async () => {
    const dir = await tempDir();
    const [first, busy] = await inJournal(
      dir,
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const gated = recordingHost({
          onExecute: (operationId) =>
            operationId === "pets.get"
              ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
              : Effect.void,
        });
        return yield* Effect.all(
          [
            runDurableProgramEffect({ source: SOURCE, programId: ID }, gated.host, {}),
            Deferred.await(entered).pipe(
              Effect.andThen(resumeProgramEffect(ID, recordingHost().host, {})),
              Effect.tap(() => Deferred.succeed(release, undefined))
            ),
          ],
          { concurrency: "unbounded" }
        );
      })
    );
    expect(busy).toMatchObject({ ok: false, diagnostics: { code: "program_busy" } });
    expect(first.ok).toBe(true);
  });

  it("a journal that no longer matches its plan fails the program for good", async () => {
    const dir = await tempDir();
    await crashAfter(dir, recordingHost().host, 1);
    await Effect.runPromise(
      Effect.flatMap(makeFileProgramJournalEffect(dir), (journal) =>
        journal.appendEntry(ID, {
          index: 1,
          callId: "forged",
          tool: "execute",
          operationId: "pets.list",
          args: { page: 2 },
          result: { ok: true, value: { forged: true } },
          completedAt: new Date().toISOString(),
        })
      )
    );

    const host = recordingHost();
    expect(await resume(dir, host.host)).toMatchObject({
      ok: false,
      diagnostics: { code: "journal_divergence", durable: { status: "failed" } },
    });
    expect(host.executed).toEqual([]);
    expect((await loadJournal(dir))?.status).toBe("failed");
    expect(await resume(dir, host.host)).toMatchObject({
      ok: false,
      diagnostics: { code: "program_failed" },
    });
  });

  it("executeDurableProgramEffect journals under CLAWQL_PROGRAM_JOURNAL_DIR", async () => {
    const dir = await tempDir();
    const out = await Effect.runPromise(
      executeDurableProgramEffect({ source: SOURCE, programId: ID }, recordingHost().host, {
        CLAWQL_PROGRAM_JOURNAL_DIR: dir,
      })
    );
    expect(out.ok).toBe(true);
    expect((await loadJournal(dir))?.status).toBe("completed");

    const notADir = join(dir, "not-a-dir");
    await writeFile(notADir, "");
    const refused = await Effect.runPromise(
      executeDurableProgramEffect({ source: SOURCE }, recordingHost().host, {
        CLAWQL_PROGRAM_JOURNAL_DIR: notADir,
      })
    );
    expect(refused).toMatchObject({ ok: false, diagnostics: { code: "journal_unavailable" } });
  });

  it("DurableProgramRunnerService runs and resumes over the journal it is built with", async () => {
    const dir = await tempDir();
    const host = recordingHost();
    const { first, again } = await Effect.runPromise(
      Effect.gen(function* () {
        const runner = yield* DurableProgramRunnerService;
        const first = yield* runner.run({ source: SOURCE, programId: ID }, host.host, {});
        const again = yield* runner.resume(ID, host.host, {});
        return { first, again };
      }).pipe(
        Effect.provide(DurableProgramRunnerLive.pipe(Layer.provide(programJournalFileLayer(dir))))
      )
    );
    expect(first.ok).toBe(true);
    expect(again.result).toEqual(first.result);
    expect(host.executed).toEqual([...OPS]);
  });
});

describe("durable program flags", () => {
  it("CLAWQL_ENABLE_DURABLE_PROGRAMS implies programs; CLAWQL_ENABLE_PROGRAMS alone is not durable", () => {
    expect(programsEnabled({ CLAWQL_ENABLE_DURABLE_PROGRAMS: "1" })).toBe(true);
    expect(durableProgramsEnabled({ CLAWQL_ENABLE_DURABLE_PROGRAMS: "true" })).toBe(true);
    expect(durableProgramsEnabled({ CLAWQL_ENABLE_PROGRAMS: "1" })).toBe(false);
    expect(durableProgramsEnabled({})).toBe(false);
  });

  it("ProgramModeService reports the durable flag", async () => {
    const durable = await Effect.runPromise(
      Effect.gen(function* () {
        const mode = yield* ProgramModeService;
        return yield* mode.durableEnabled({ CLAWQL_ENABLE_DURABLE_PROGRAMS: "1" });
      }).pipe(Effect.provide(ProgramModeLive))
    );
    expect(durable).toBe(true);
  });
});

const killWorker = fileURLToPath(new URL("./durable-runner-kill-worker.ts", import.meta.url));

type WorkerExit = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
};

function runKillWorker(env: Readonly<Record<string, string>>): Promise<WorkerExit> {
  return new Promise((resolve, reject) => {
    const child = fork(killWorker, [], {
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

describe("durable programs: real process kill", () => {
  it("SIGKILL inside the third call: a new process replays two calls and re-runs the interrupted read", async () => {
    const dir = await tempDir();
    const hostLog = join(dir, "host.log");
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: ID,
      SESSION_ID: "kill-test",
      SOURCE,
      KILL_AT_OPERATION: "owners.list",
    });
    expect(child.signal, child.stderr).toBe("SIGKILL");
    expect((await readFile(hostLog, "utf8")).trim().split("\n")).toEqual([...OPS]);
    const killed = await loadJournal(dir);
    expect(killed).toMatchObject({ status: "running", intents: [] });
    expect(killed?.entries.map((e) => e.index)).toEqual([0, 1]);

    const parent = recordingHost();
    const resumed = await resume(dir, parent.host, "kill-test");
    expect(parent.executed).toEqual(["owners.list"]);
    expect(resumed.ok).toBe(true);
    expect(resumed.calls.map((c) => c.replayed)).toEqual([true, true, undefined]);
    expect(resumed.result).toEqual((await baseline()).result);
  }, 60_000);

  it("SIGKILL inside a write: the resumed program reports outcome_unknown and does not send it again", async () => {
    const dir = await tempDir();
    const hostLog = join(dir, "host.log");
    const child = await runKillWorker({
      JOURNAL_DIR: dir,
      HOST_LOG: hostLog,
      PROGRAM_ID: ID,
      SESSION_ID: "kill-test",
      SOURCE: planSource("sequential", WRITE_PLAN_OPS),
      KILL_AT_OPERATION: "owners.create",
      WRITE_OPERATIONS: "owners.create",
    });
    expect(child.signal, child.stderr).toBe("SIGKILL");
    expect((await readFile(hostLog, "utf8")).trim().split("\n")).toEqual([...WRITE_PLAN_OPS]);
    expect((await loadJournal(dir))?.intents.map((i) => i.operationId)).toEqual(["owners.create"]);

    const parent = recordingHost({ writes: ["owners.create"] });
    const resumed = await resume(dir, parent.host, "kill-test");
    expect(parent.executed).toEqual([]);
    expect(resumed.ok).toBe(false);
    expect(resumed.calls[2]).toMatchObject({ ok: false, status: "outcome_unknown" });
    expect(resumed.diagnostics.durable).toMatchObject({
      status: "completed",
      outcomeUnknownCalls: 1,
    });
  }, 60_000);
});
