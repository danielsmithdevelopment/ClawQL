/**
 * Durable program journal (ADR 0015 durable code mode — program mode step 2).
 *
 * Records every completed program tool call and every nondeterministic value a
 * program observes, so a crashed or parked program resumes by replaying the
 * journal instead of calling tools again.
 *
 * Backend: append-only JSONL, one file per program in `CLAWQL_PROGRAM_JOURNAL_DIR`
 * (default `$CLAWQL_HOME/program-journal`, else `<os tmpdir>/clawql-program-journal`).
 * An append resolves only after its record is fsync'd. Appends are serialized, so
 * only the final record can be torn by a crash; it was never acknowledged: `load`
 * ignores it and the next append truncates it away.
 *
 * celld-shaped stand-in: once the pinned celld build hosts the isolate, the
 * journal moves into the cell's SQLite (LTX, RPO=0) behind this same service.
 * One writer per program: {@link ProgramJournalApi.withLease} is process-wide;
 * across processes, one runner per journal directory (same posture as the file
 * pending store). Journals hold call results — files are 0600 in a 0700 directory
 * this user owns.
 */

import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Clock, Context, Data, Effect, Layer, Semaphore } from "effect";
import type { ProgramPlan } from "./program-plan.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const NEWLINE = 0x0a;
const TAIL_CHUNK_BYTES = 64 * 1024;
const PROGRAM_ID_PATTERN = /^prog_[A-Za-z0-9_-]{8,128}$/;

export type ProgramJournalBackend = "file-jsonl";

export type ProgramJournalStatus = "running" | "parked" | "completed" | "failed";

/** What the program saw for one call — replayed verbatim on resume. */
export type ProgramJournalCallResult = {
  readonly ok: boolean;
  readonly status?: string;
  readonly error?: string;
  readonly resultPreview?: string;
  readonly value: unknown;
};

export type ProgramJournalEntry = {
  readonly index: number;
  readonly callId: string;
  readonly tool: "execute" | "search";
  readonly operationId?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly result: ProgramJournalCallResult;
  readonly completedAt: string;
};

export type ProgramJournalNondet = {
  readonly key: string;
  readonly value: unknown;
};

/**
 * A call that may have a side effect is about to reach the host. An intent with
 * no entry means the outcome is unknown — the call must not be re-run.
 */
export type ProgramJournalIntent = {
  readonly index: number;
  readonly callId: string;
  readonly operationId: string;
  readonly startedAt: string;
};

export type ProgramJournal = {
  readonly programId: string;
  readonly sourceHash: string;
  /** Session / API-key label key that created the program; resume must present the same. */
  readonly owner: string;
  readonly plan: ProgramPlan;
  readonly status: ProgramJournalStatus;
  readonly entries: readonly ProgramJournalEntry[];
  readonly nondet: readonly ProgramJournalNondet[];
  readonly intents: readonly ProgramJournalIntent[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
};

export type ProgramJournalCreateInput = {
  readonly programId: string;
  readonly sourceHash: string;
  readonly owner: string;
  readonly plan: ProgramPlan;
};

export class ProgramJournalError extends Data.TaggedError("ProgramJournalError")<{
  readonly programId: string;
  readonly reason: "invalid_id" | "exists" | "not_found" | "corrupt" | "busy" | "io";
  readonly message: string;
}> {}

export type ProgramJournalApi = {
  readonly backend: ProgramJournalBackend;
  readonly create: (
    input: ProgramJournalCreateInput
  ) => Effect.Effect<ProgramJournal, ProgramJournalError>;
  readonly appendEntry: (
    programId: string,
    entry: ProgramJournalEntry
  ) => Effect.Effect<void, ProgramJournalError>;
  readonly appendNondet: (
    programId: string,
    nondet: ProgramJournalNondet
  ) => Effect.Effect<void, ProgramJournalError>;
  readonly appendIntent: (
    programId: string,
    intent: ProgramJournalIntent
  ) => Effect.Effect<void, ProgramJournalError>;
  /** `null` when no journal (or no acknowledged record) exists for `programId`. */
  readonly load: (programId: string) => Effect.Effect<ProgramJournal | null, ProgramJournalError>;
  readonly markStatus: (
    programId: string,
    status: ProgramJournalStatus,
    detail?: { readonly error?: string }
  ) => Effect.Effect<void, ProgramJournalError>;
  /**
   * Run `effect` as the only writer of `programId` in this process (fails `busy`
   * while another fiber holds it). Released however `effect` ends.
   */
  readonly withLease: <A, E, R>(
    programId: string,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | ProgramJournalError, R>;
};

export class ProgramJournalService extends Context.Service<
  ProgramJournalService,
  ProgramJournalApi
>()("clawql/ProgramJournalService") {}

type CreateRecord = {
  readonly t: "create";
  readonly v: 1;
  readonly programId: string;
  readonly sourceHash: string;
  readonly owner: string;
  readonly plan: ProgramPlan;
  readonly at: string;
};

type JournalRecord =
  | CreateRecord
  | { readonly t: "entry"; readonly entry: ProgramJournalEntry; readonly at: string }
  | { readonly t: "nondet"; readonly key: string; readonly value: unknown; readonly at: string }
  | { readonly t: "intent"; readonly intent: ProgramJournalIntent; readonly at: string }
  | {
      readonly t: "status";
      readonly status: ProgramJournalStatus;
      readonly error?: string;
      readonly at: string;
    };

const STATUSES: ReadonlySet<string> = new Set(["running", "parked", "completed", "failed"]);

/** Journal files with a live writer in this process — shared by every journal instance. */
const leasedJournalFiles = new Set<string>();

/** Journal directory: explicit dir, else `$CLAWQL_HOME/program-journal`, else OS tmpdir. */
export function resolveProgramJournalDirEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> {
  return Effect.sync(() => {
    const explicit = env.CLAWQL_PROGRAM_JOURNAL_DIR?.trim();
    if (explicit) return resolve(explicit);
    const home = env.CLAWQL_HOME?.trim();
    if (home) return resolve(home, "program-journal");
    return join(tmpdir(), "clawql-program-journal");
  });
}

/** Program ids double as journal file names — restrict them to a path-safe shape. */
export function validateProgramIdEffect(
  programId: string
): Effect.Effect<string, ProgramJournalError> {
  return Effect.suspend(() => {
    const id = programId.trim();
    return PROGRAM_ID_PATTERN.test(id)
      ? Effect.succeed(id)
      : Effect.fail(
          new ProgramJournalError({
            programId: id.slice(0, 140),
            reason: "invalid_id",
            message: "programId must match prog_[A-Za-z0-9_-]{8,128}",
          })
        );
  });
}

export function hashProgramSourceEffect(source: string): Effect.Effect<string> {
  return Effect.sync(() => `sha256:${createHash("sha256").update(source, "utf8").digest("hex")}`);
}

const nowIsoEffect: Effect.Effect<string> = Effect.map(Clock.currentTimeMillis, (ms) =>
  new Date(ms).toISOString()
);

function isErrno(cause: unknown, code: string): boolean {
  return (cause as NodeJS.ErrnoException | undefined)?.code === code;
}

function ioError(programId: string, cause: unknown): ProgramJournalError {
  return new ProgramJournalError({
    programId,
    reason: "io",
    message: `program journal ${programId}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });
}

function encodeRecord(record: JournalRecord): Buffer {
  return Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
}

async function writeFully(fh: FileHandle, buf: Buffer, position: number): Promise<void> {
  let offset = 0;
  while (offset < buf.length) {
    const { bytesWritten } = await fh.write(buf, offset, buf.length - offset, position + offset);
    offset += bytesWritten;
  }
}

async function fsyncDirBestEffort(dir: string): Promise<void> {
  try {
    const dh = await open(dir, "r");
    try {
      await dh.sync();
    } finally {
      await dh.close();
    }
  } catch {
    /* directory fsync is not supported on every platform (e.g. Windows) */
  }
}

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Offset of the last newline before `end`, or -1. */
async function lastNewlineBefore(fh: FileHandle, end: number): Promise<number> {
  const chunk = Buffer.alloc(Math.max(1, Math.min(TAIL_CHUNK_BYTES, end)));
  let pos = end;
  while (pos > 0) {
    const start = Math.max(0, pos - chunk.length);
    const { bytesRead } = await fh.read(chunk, 0, pos - start, start);
    const at = chunk.subarray(0, bytesRead).lastIndexOf(NEWLINE);
    if (at >= 0) return start + at;
    pos = start;
  }
  return -1;
}

/**
 * Bytes covered by acknowledged records. Only the final record can be torn:
 * unterminated, or — where pages persist out of order — terminated but not JSON.
 * Reads just the last record, so appends stay linear in journal size.
 */
async function acknowledgedLength(fh: FileHandle, size: number): Promise<number> {
  const lastNewline = await lastNewlineBefore(fh, size);
  if (lastNewline < 0) return 0;
  const prevNewline = await lastNewlineBefore(fh, lastNewline);
  const line = Buffer.alloc(lastNewline - prevNewline - 1);
  if (line.length > 0) await fh.read(line, 0, line.length, prevNewline + 1);
  return parsesAsJson(line.toString("utf8")) ? lastNewline + 1 : prevNewline + 1;
}

function noJournalError(): NodeJS.ErrnoException {
  return Object.assign(new Error("no acknowledged journal record"), { code: "ENOENT" });
}

/**
 * Create the journal directory, refusing one another local user controls: the
 * default lives under the shared OS tmpdir, and a planted journal would feed
 * forged results to a resumed program.
 */
async function ensureJournalDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const st = await stat(dir);
  if (!st.isDirectory()) throw new Error(`${dir} is not a directory`);
  const uid = process.getuid?.();
  if (uid !== undefined && st.uid !== uid) {
    throw new Error(`journal directory ${dir} is owned by uid ${st.uid}, not this user (${uid})`);
  }
  if ((st.mode & 0o002) !== 0) throw new Error(`journal directory ${dir} is world-writable`);
}

async function createJournalFile(path: string, dir: string, record: Buffer): Promise<void> {
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  let fh: FileHandle;
  try {
    fh = await open(path, "wx", FILE_MODE);
  } catch (e: unknown) {
    if (!isErrno(e, "EEXIST")) throw e;
    fh = await open(path, "r+");
    try {
      // A create torn by a crash left no acknowledged record — reclaim the file.
      if ((await acknowledgedLength(fh, (await fh.stat()).size)) > 0) throw e;
      await fh.truncate(0);
    } catch (inner: unknown) {
      await fh.close();
      throw inner;
    }
  }
  try {
    await writeFully(fh, record, 0);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsyncDirBestEffort(dir);
}

/** Append one record and fsync, first truncating a torn final record. */
async function appendRecordDurable(path: string, record: Buffer): Promise<void> {
  const fh = await open(path, "r+");
  try {
    const { size } = await fh.stat();
    const end = await acknowledgedLength(fh, size);
    if (end === 0) throw noJournalError();
    if (end < size) await fh.truncate(end);
    await writeFully(fh, record, end);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPlan(v: unknown): v is ProgramPlan {
  return (
    isObject(v) &&
    v.v === 1 &&
    v.kind === "plan" &&
    (v.mode === "parallel" || v.mode === "sequential") &&
    Array.isArray(v.calls)
  );
}

function isCreateRecord(v: Record<string, unknown>, programId: string): v is CreateRecord {
  return (
    v.t === "create" &&
    v.v === 1 &&
    v.programId === programId &&
    typeof v.sourceHash === "string" &&
    typeof v.owner === "string" &&
    isPlan(v.plan)
  );
}

function isEntry(v: unknown, callCount: number): v is ProgramJournalEntry {
  if (!isObject(v) || !isObject(v.result)) return false;
  const index = v.index;
  return (
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < callCount &&
    typeof v.callId === "string" &&
    (v.tool === "execute" || v.tool === "search") &&
    typeof v.completedAt === "string" &&
    typeof v.result.ok === "boolean"
  );
}

function isIntent(v: unknown, callCount: number): v is ProgramJournalIntent {
  if (!isObject(v)) return false;
  const index = v.index;
  return (
    typeof index === "number" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < callCount &&
    typeof v.callId === "string" &&
    typeof v.operationId === "string" &&
    typeof v.startedAt === "string"
  );
}

/** Fold journal records; `null` when nothing was acknowledged (torn or empty create). */
function decodeJournal(
  programId: string,
  text: string
): ProgramJournal | null | ProgramJournalError {
  // Only newline-terminated records were acknowledged; the final segment is "" or torn.
  const lines = text.split("\n").slice(0, -1);
  // Same rule as acknowledgedLength: a terminated but unparseable final record is torn.
  if (lines.length > 0 && !parsesAsJson(lines[lines.length - 1]!)) lines.pop();
  if (lines.length === 0) return null;
  const corrupt = (line: number, why: string) =>
    new ProgramJournalError({
      programId,
      reason: "corrupt",
      message: `program journal ${programId} line ${line}: ${why}`,
    });

  let create: CreateRecord | undefined;
  const entries = new Map<number, ProgramJournalEntry>();
  const nondet = new Map<string, unknown>();
  const intents = new Map<number, ProgramJournalIntent>();
  let status: ProgramJournalStatus = "running";
  let lastError: string | undefined;
  let updatedAt = "";

  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    let rec: unknown;
    try {
      rec = JSON.parse(lines[i]!) as unknown;
    } catch {
      return corrupt(line, "not JSON");
    }
    if (!isObject(rec) || typeof rec.at !== "string") return corrupt(line, "not a journal record");
    if (!create) {
      if (!isCreateRecord(rec, programId)) return corrupt(line, "expected create record");
      create = rec;
    } else if (rec.t === "entry") {
      if (!isEntry(rec.entry, create.plan.calls.length)) return corrupt(line, "invalid entry");
      // First completion wins: it is the result the program actually observed.
      if (!entries.has(rec.entry.index)) entries.set(rec.entry.index, rec.entry);
    } else if (rec.t === "nondet") {
      if (typeof rec.key !== "string" || !rec.key) return corrupt(line, "invalid nondet key");
      if (!nondet.has(rec.key)) nondet.set(rec.key, rec.value);
    } else if (rec.t === "intent") {
      if (!isIntent(rec.intent, create.plan.calls.length)) return corrupt(line, "invalid intent");
      if (!intents.has(rec.intent.index)) intents.set(rec.intent.index, rec.intent);
    } else if (rec.t === "status") {
      if (typeof rec.status !== "string" || !STATUSES.has(rec.status)) {
        return corrupt(line, "invalid status");
      }
      status = rec.status as ProgramJournalStatus;
      lastError = typeof rec.error === "string" ? rec.error : undefined;
    } else {
      return corrupt(line, `unknown record type ${JSON.stringify(rec.t)}`);
    }
    updatedAt = rec.at;
  }

  if (!create) return null;
  return {
    programId,
    sourceHash: create.sourceHash,
    owner: create.owner,
    plan: create.plan,
    status,
    entries: [...entries.values()].sort((a, b) => a.index - b.index),
    nondet: [...nondet.entries()].map(([key, value]) => ({ key, value })),
    intents: [...intents.values()].sort((a, b) => a.index - b.index),
    createdAt: create.at,
    updatedAt,
    ...(lastError !== undefined ? { lastError } : {}),
  };
}

/** File (JSONL) journal rooted at `dir` — created 0700, refused if another user controls it. */
export function makeFileProgramJournalEffect(
  dir: string
): Effect.Effect<ProgramJournalApi, ProgramJournalError> {
  return Effect.gen(function* () {
    const root = resolve(dir);
    yield* Effect.tryPromise({
      try: () => ensureJournalDir(root),
      catch: (cause) =>
        new ProgramJournalError({
          programId: "",
          reason: "io",
          message: `program journal directory: ${cause instanceof Error ? cause.message : String(cause)}`,
        }),
    });
    const lock = yield* Semaphore.make(1);
    const pathFor = (programId: string) => join(root, `${programId}.jsonl`);
    // An interrupted append must not release the lock while its write is still in flight.
    const serialized = <A>(effect: Effect.Effect<A, ProgramJournalError>) =>
      Effect.uninterruptible(lock.withPermits(1)(effect));

    const append = (programId: string, toRecord: (at: string) => JournalRecord) =>
      serialized(
        Effect.gen(function* () {
          const id = yield* validateProgramIdEffect(programId);
          const at = yield* nowIsoEffect;
          yield* Effect.tryPromise({
            try: () => appendRecordDurable(pathFor(id), encodeRecord(toRecord(at))),
            catch: (cause) =>
              isErrno(cause, "ENOENT")
                ? new ProgramJournalError({
                    programId: id,
                    reason: "not_found",
                    message: `program journal ${id} not found`,
                  })
                : ioError(id, cause),
          });
        })
      );

    const api: ProgramJournalApi = {
      backend: "file-jsonl",
      create: (input) =>
        serialized(
          Effect.gen(function* () {
            const programId = yield* validateProgramIdEffect(input.programId);
            const at = yield* nowIsoEffect;
            const record: CreateRecord = {
              t: "create",
              v: 1,
              programId,
              sourceHash: input.sourceHash,
              owner: input.owner,
              plan: input.plan,
              at,
            };
            yield* Effect.tryPromise({
              try: () => createJournalFile(pathFor(programId), root, encodeRecord(record)),
              catch: (cause) =>
                isErrno(cause, "EEXIST")
                  ? new ProgramJournalError({
                      programId,
                      reason: "exists",
                      message: `program journal ${programId} already exists`,
                    })
                  : ioError(programId, cause),
            });
            const journal: ProgramJournal = {
              programId,
              sourceHash: input.sourceHash,
              owner: input.owner,
              plan: input.plan,
              status: "running",
              entries: [],
              nondet: [],
              intents: [],
              createdAt: at,
              updatedAt: at,
            };
            return journal;
          })
        ),
      appendEntry: (programId, entry) => append(programId, (at) => ({ t: "entry", entry, at })),
      appendNondet: (programId, nondet) =>
        append(programId, (at) => ({ t: "nondet", key: nondet.key, value: nondet.value, at })),
      appendIntent: (programId, intent) => append(programId, (at) => ({ t: "intent", intent, at })),
      markStatus: (programId, status, detail) =>
        append(programId, (at) => ({
          t: "status",
          status,
          ...(detail?.error ? { error: detail.error } : {}),
          at,
        })),
      load: (programId) =>
        Effect.gen(function* () {
          const id = yield* validateProgramIdEffect(programId);
          const text = yield* Effect.tryPromise({
            try: async () => {
              try {
                return await readFile(pathFor(id), "utf8");
              } catch (e: unknown) {
                if (isErrno(e, "ENOENT")) return null;
                throw e;
              }
            },
            catch: (cause) => ioError(id, cause),
          });
          if (text === null) return null;
          const decoded = decodeJournal(id, text);
          if (decoded instanceof ProgramJournalError) return yield* Effect.fail(decoded);
          return decoded;
        }),
      withLease: <A, E, R>(programId: string, effect: Effect.Effect<A, E, R>) =>
        Effect.flatMap(validateProgramIdEffect(programId), (id) => {
          const path = pathFor(id);
          return Effect.acquireUseRelease(
            Effect.suspend(() => {
              if (leasedJournalFiles.has(path)) {
                return Effect.fail(
                  new ProgramJournalError({
                    programId: id,
                    reason: "busy",
                    message: `program ${id} is already running in this process`,
                  })
                );
              }
              leasedJournalFiles.add(path);
              return Effect.void;
            }),
            () => effect,
            () =>
              Effect.sync(() => {
                leasedJournalFiles.delete(path);
              })
          );
        }),
    };
    return api;
  });
}

export const programJournalFileLayer = (
  dir: string
): Layer.Layer<ProgramJournalService, ProgramJournalError> =>
  Layer.effect(
    ProgramJournalService,
    Effect.map(makeFileProgramJournalEffect(dir), (api) => ProgramJournalService.of(api))
  );

/** Journal rooted at {@link resolveProgramJournalDirEffect} for `env`. */
export const programJournalLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<ProgramJournalService, ProgramJournalError> =>
  Layer.effect(
    ProgramJournalService,
    Effect.gen(function* () {
      const dir = yield* resolveProgramJournalDirEffect(env);
      return ProgramJournalService.of(yield* makeFileProgramJournalEffect(dir));
    })
  );

export const ProgramJournalLive = programJournalLayer();
