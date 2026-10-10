import { appendFile, chmod, copyFile, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Clock, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  hashProgramSourceEffect,
  makeFileProgramJournalEffect,
  programJournalFileLayer,
  programJournalLayer,
  ProgramJournalError,
  ProgramJournalService,
  resolveProgramJournalDirEffect,
  validateProgramIdEffect,
  type ProgramJournalApi,
  type ProgramJournalEntry,
} from "./program-journal.js";
import type { ProgramPlan } from "./program-plan.js";

const PLAN: ProgramPlan = {
  v: 1,
  kind: "plan",
  mode: "sequential",
  calls: [
    { tool: "execute", operationId: "pets.get", args: { id: 1 }, id: "first" },
    { tool: "execute", operationId: "pets.list" },
    { tool: "search", query: "owners" },
  ],
};

const ID = "prog_journaltest01";
const T0 = Date.parse("2026-10-09T12:00:00.000Z");
const iso = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

/** Each read advances one second, so record timestamps are deterministic. */
function steppingClock(): Clock.Clock {
  let now = T0;
  const tick = () => (now += 1000);
  return {
    currentTimeMillisUnsafe: tick,
    currentTimeMillis: Effect.sync(tick),
    currentTimeNanosUnsafe: () => BigInt(tick()) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => BigInt(tick()) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    monotonicTimeNanos: Effect.sync(() => BigInt(now) * 1_000_000n),
    sleep: () => Effect.void,
  };
}

function entry(index: number, value: unknown, ok = true): ProgramJournalEntry {
  const call = PLAN.calls[index]!;
  return {
    index,
    callId: call.id ?? `call_${index}`,
    tool: call.tool,
    ...(call.tool === "execute" ? { operationId: call.operationId, args: call.args ?? {} } : {}),
    result: { ok, value },
    completedAt: iso(100 + index),
  };
}

const INTENT = {
  index: 1,
  callId: "call_1",
  operationId: "pets.list",
  startedAt: iso(50),
} as const;

const tempDir = () => mkdtemp(join(tmpdir(), "clawql-journal-"));
const journalPath = (dir: string, programId = ID) => join(dir, `${programId}.jsonl`);

function withJournal<A, E>(
  dir: string,
  f: (journal: ProgramJournalApi) => Effect.Effect<A, E>
): Promise<A> {
  return Effect.runPromise(
    Effect.flatMap(makeFileProgramJournalEffect(dir), f).pipe(
      Effect.provideService(Clock.Clock, steppingClock())
    )
  );
}

const create = (journal: ProgramJournalApi, programId = ID) =>
  journal.create({ programId, sourceHash: "sha256:abc", owner: "session:test", plan: PLAN });

async function records(dir: string, programId = ID): Promise<Record<string, unknown>[]> {
  const text = await readFile(journalPath(dir, programId), "utf8");
  expect(text.endsWith("\n")).toBe(true);
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("ProgramJournalService (file JSONL)", () => {
  it("round-trips entries, nondeterministic values and status", async () => {
    const dir = await tempDir();
    const { created, loaded } = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        const created = yield* create(journal);
        yield* journal.appendEntry(ID, entry(1, { pets: [] }));
        yield* journal.appendEntry(ID, entry(0, { id: 1, name: "Rex" }));
        yield* journal.appendNondet(ID, { key: "clock.startedAt", value: iso(0) });
        yield* journal.appendIntent(ID, INTENT);
        yield* journal.markStatus(ID, "parked", { error: "program timed out after 5ms" });
        return { created, loaded: yield* journal.load(ID) };
      })
    );

    expect(created).toEqual({
      programId: ID,
      sourceHash: "sha256:abc",
      owner: "session:test",
      plan: PLAN,
      status: "running",
      entries: [],
      nondet: [],
      intents: [],
      createdAt: iso(1),
      updatedAt: iso(1),
    });
    expect(loaded).toEqual({
      programId: ID,
      sourceHash: "sha256:abc",
      owner: "session:test",
      plan: PLAN,
      status: "parked",
      entries: [entry(0, { id: 1, name: "Rex" }), entry(1, { pets: [] })],
      nondet: [{ key: "clock.startedAt", value: iso(0) }],
      intents: [INTENT],
      createdAt: iso(1),
      updatedAt: iso(6),
      lastError: "program timed out after 5ms",
    });
    expect((await records(dir)).map((r) => r.t)).toEqual([
      "create",
      "entry",
      "entry",
      "nondet",
      "intent",
      "status",
    ]);
  });

  it("keeps the first completion and first nondet value; status is last-write-wins", async () => {
    const dir = await tempDir();
    const loaded = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        yield* create(journal);
        yield* journal.appendEntry(ID, entry(0, "observed"));
        yield* journal.appendEntry(ID, entry(0, "re-run"));
        yield* journal.appendNondet(ID, { key: "k", value: 1 });
        yield* journal.appendNondet(ID, { key: "k", value: 2 });
        yield* journal.appendIntent(ID, INTENT);
        yield* journal.appendIntent(ID, { ...INTENT, startedAt: iso(60) });
        yield* journal.markStatus(ID, "parked", { error: "timed out" });
        yield* journal.markStatus(ID, "running");
        return yield* journal.load(ID);
      })
    );
    expect(loaded?.entries).toEqual([entry(0, "observed")]);
    expect(loaded?.nondet).toEqual([{ key: "k", value: 1 }]);
    expect(loaded?.intents).toEqual([INTENT]);
    expect(loaded?.status).toBe("running");
    expect(loaded).not.toHaveProperty("lastError");
  });

  it("refuses a second create for the same programId", async () => {
    const dir = await tempDir();
    const err = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        yield* create(journal);
        return yield* Effect.flip(create(journal));
      })
    );
    expect(err).toBeInstanceOf(ProgramJournalError);
    expect(err).toMatchObject({ programId: ID, reason: "exists" });
    expect(await records(dir)).toHaveLength(1);
  });

  it("missing journals load as null; appends fail not_found without creating a file", async () => {
    const dir = await tempDir();
    const out = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        return {
          loaded: yield* journal.load(ID),
          entry: yield* Effect.flip(journal.appendEntry(ID, entry(0, null))),
          nondet: yield* Effect.flip(journal.appendNondet(ID, { key: "k", value: 1 })),
          status: yield* Effect.flip(journal.markStatus(ID, "failed")),
        };
      })
    );
    expect(out.loaded).toBeNull();
    for (const err of [out.entry, out.nondet, out.status]) {
      expect(err).toMatchObject({ programId: ID, reason: "not_found" });
    }
    await expect(stat(journalPath(dir))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("only accepts path-safe program ids", async () => {
    for (const bad of [
      "../../etc/passwd",
      "prog_short",
      "prog_abcdefgh/../x",
      "prog_a b c d e f",
      "",
    ]) {
      const err = await Effect.runPromise(Effect.flip(validateProgramIdEffect(bad)));
      expect(err).toMatchObject({ reason: "invalid_id" });
    }
    expect(await Effect.runPromise(validateProgramIdEffect("  prog_abcdefgh12  "))).toBe(
      "prog_abcdefgh12"
    );

    const dir = await tempDir();
    const err = await withJournal(dir, (journal) =>
      Effect.flip(create(journal, "../escape-attempt"))
    );
    expect(err).toMatchObject({ reason: "invalid_id" });
    await expect(stat(join(dir, "..", "escape-attempt.jsonl"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("ignores an unterminated torn record and truncates it on the next append", async () => {
    const dir = await tempDir();
    await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        yield* create(journal);
        yield* journal.appendEntry(ID, entry(0, "a"));
      })
    );
    await appendFile(journalPath(dir), '{"t":"entry","entry":{"index":1,"callId":"ca');

    const { beforeAppend, afterAppend } = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        const beforeAppend = yield* journal.load(ID);
        yield* journal.appendEntry(ID, entry(1, "b"));
        return { beforeAppend, afterAppend: yield* journal.load(ID) };
      })
    );
    expect(beforeAppend?.entries).toEqual([entry(0, "a")]);
    expect(afterAppend?.entries).toEqual([entry(0, "a"), entry(1, "b")]);
    expect((await records(dir)).map((r) => r.t)).toEqual(["create", "entry", "entry"]);
  });

  it("treats a newline-terminated but unparseable final record as torn", async () => {
    const dir = await tempDir();
    await withJournal(dir, (journal) =>
      Effect.flatMap(create(journal), () => journal.appendEntry(ID, entry(0, "a")))
    );
    // Pages persisted out of order: the terminator landed, earlier bytes did not.
    await appendFile(journalPath(dir), '\u0000\u0000\u0000"index":1}\n');

    const { beforeAppend, afterAppend } = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        const beforeAppend = yield* journal.load(ID);
        yield* journal.markStatus(ID, "completed");
        return { beforeAppend, afterAppend: yield* journal.load(ID) };
      })
    );
    expect(beforeAppend?.entries).toEqual([entry(0, "a")]);
    expect(beforeAppend?.status).toBe("running");
    expect(afterAppend?.status).toBe("completed");
    expect((await records(dir)).map((r) => r.t)).toEqual(["create", "entry", "status"]);
  });

  it("reclaims a create torn by a crash", async () => {
    for (const torn of ['{"t":"create","v":1,"programId":"prog_jour', "\u0000\u0000\u0000\n"]) {
      const dir = await tempDir();
      await writeFile(journalPath(dir), torn, { mode: 0o600 });
      const out = await withJournal(dir, (journal) =>
        Effect.gen(function* () {
          const before = yield* journal.load(ID);
          const appendErr = yield* Effect.flip(journal.appendEntry(ID, entry(0, "a")));
          yield* create(journal);
          return { before, appendErr, after: yield* journal.load(ID) };
        })
      );
      expect(out.before).toBeNull();
      expect(out.appendErr).toMatchObject({ reason: "not_found" });
      expect(out.after).toMatchObject({ programId: ID, status: "running", entries: [] });
      expect((await records(dir)).map((r) => r.t)).toEqual(["create"]);
    }
  });

  it("fails closed on damage before the final record", async () => {
    const dir = await tempDir();
    await withJournal(dir, (journal) =>
      Effect.flatMap(create(journal), () => journal.appendEntry(ID, entry(0, "a")))
    );
    const valid = JSON.stringify({ t: "entry", entry: entry(1, "b"), at: iso(9) });
    await appendFile(journalPath(dir), `not json\n${valid}\n`);
    const err = await withJournal(dir, (journal) => Effect.flip(journal.load(ID)));
    expect(err).toMatchObject({ programId: ID, reason: "corrupt" });
    expect(err.message).toContain("line 3: not JSON");
  });

  it("fails closed on records that do not fit the plan or the file name", async () => {
    const dir = await tempDir();
    await withJournal(dir, (journal) =>
      Effect.flatMap(create(journal), () =>
        journal.appendEntry(ID, { ...entry(0, "a"), index: PLAN.calls.length })
      )
    );
    const outOfRange = await withJournal(dir, (journal) => Effect.flip(journal.load(ID)));
    expect(outOfRange).toMatchObject({ reason: "corrupt" });
    expect(outOfRange.message).toContain("invalid entry");

    const intentDir = await tempDir();
    await withJournal(intentDir, (journal) =>
      Effect.flatMap(create(journal), () => journal.appendIntent(ID, { ...INTENT, index: -1 }))
    );
    const badIntent = await withJournal(intentDir, (journal) => Effect.flip(journal.load(ID)));
    expect(badIntent.message).toContain("invalid intent");

    const other = "prog_journaltest02";
    await copyFile(journalPath(dir), journalPath(dir, other));
    const renamed = await withJournal(dir, (journal) => Effect.flip(journal.load(other)));
    expect(renamed).toMatchObject({ programId: other, reason: "corrupt" });
    expect(renamed.message).toContain("expected create record");
  });

  it.skipIf(process.platform === "win32")("writes 0600 files inside a 0700 directory", async () => {
    const dir = join(await tempDir(), "nested", "journal");
    await withJournal(dir, (journal) => create(journal));
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(journalPath(dir))).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === "win32")(
    "refuses a world-writable journal directory (shared tmpdir default)",
    async () => {
      const dir = await tempDir();
      await chmod(dir, 0o777);
      const err = await Effect.runPromise(Effect.flip(makeFileProgramJournalEffect(dir)));
      expect(err).toMatchObject({ reason: "io" });
      expect(err.message).toContain("world-writable");
    }
  );

  it("leases one writer per program across journal instances, released however the run ends", async () => {
    const dir = await tempDir();
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* makeFileProgramJournalEffect(dir);
        const b = yield* makeFileProgramJournalEffect(dir);
        const whileHeld = yield* a.withLease(
          ID,
          Effect.all({
            busy: Effect.flip(b.withLease(ID, Effect.void)),
            other: b.withLease("prog_journaltest02", Effect.succeed("free")),
          })
        );
        const afterFailure = yield* Effect.flip(a.withLease(ID, Effect.fail("boom" as const)));
        const afterDefect = yield* Effect.exit(a.withLease(ID, Effect.die("crash")));
        const reacquired = yield* b.withLease(ID, Effect.succeed("again"));
        return { whileHeld, afterFailure, afterDefect, reacquired };
      })
    );
    expect(out.whileHeld.busy).toMatchObject({ programId: ID, reason: "busy" });
    expect(out.whileHeld.other).toBe("free");
    expect(out.afterFailure).toBe("boom");
    expect(Exit.hasDies(out.afterDefect)).toBe(true);
    expect(out.reacquired).toBe("again");
  });

  it("serializes concurrent appends into whole records", async () => {
    const dir = await tempDir();
    const loaded = await withJournal(dir, (journal) =>
      Effect.gen(function* () {
        yield* create(journal);
        yield* Effect.all(
          [
            ...PLAN.calls.map((_, i) => journal.appendEntry(ID, entry(i, `v${i}`))),
            ...Array.from({ length: 20 }, (_, i) =>
              journal.appendNondet(ID, { key: `k${i}`, value: "x".repeat(10_000) })
            ),
          ],
          { concurrency: "unbounded" }
        );
        return yield* journal.load(ID);
      })
    );
    expect(loaded?.entries.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(loaded?.nondet).toHaveLength(20);
    expect(await records(dir)).toHaveLength(1 + PLAN.calls.length + 20);
  });

  it("resolves the journal directory: explicit dir, then CLAWQL_HOME, then tmpdir", async () => {
    const dirFor = (env: NodeJS.ProcessEnv) =>
      Effect.runPromise(resolveProgramJournalDirEffect(env));
    expect(await dirFor({ CLAWQL_PROGRAM_JOURNAL_DIR: " /var/j ", CLAWQL_HOME: "/h" })).toBe(
      resolve("/var/j")
    );
    expect(await dirFor({ CLAWQL_PROGRAM_JOURNAL_DIR: "  ", CLAWQL_HOME: "/h" })).toBe(
      resolve("/h", "program-journal")
    );
    expect(await dirFor({})).toBe(join(tmpdir(), "clawql-program-journal"));
  });

  it("is provided as a Layer, rooted at the resolved directory", async () => {
    const dir = await tempDir();
    const program = Effect.gen(function* () {
      const journal = yield* ProgramJournalService;
      yield* create(journal);
      return { backend: journal.backend, loaded: yield* journal.load(ID) };
    });

    const viaDir = await Effect.runPromise(Effect.provide(program, programJournalFileLayer(dir)));
    expect(viaDir.backend).toBe("file-jsonl");
    expect(viaDir.loaded?.status).toBe("running");

    const envDir = await tempDir();
    await Effect.runPromise(
      Effect.provide(program, programJournalLayer({ CLAWQL_PROGRAM_JOURNAL_DIR: envDir }))
    );
    expect(await records(envDir)).toHaveLength(1);
  });

  it("hashes program source as sha256 over UTF-8", async () => {
    expect(await Effect.runPromise(hashProgramSourceEffect("abc"))).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
