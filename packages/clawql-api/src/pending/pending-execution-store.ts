/**
 * Persist parked execute calls under $CLAWQL_HOME.
 *
 * Default backend is SQLite (shared-store SQL CAS across processes).
 * Set CLAWQL_PENDING_STORE=file for legacy JSON+lockfile (single-process).
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import { pendingStoreBackend } from "./pending-store-backend.js";
import {
  deletePendingSqliteEffect,
  listPendingSqliteIdsEffect,
  readPendingSqliteEffect,
  tryConsumeApprovedSqliteEffect,
  updatePendingSqliteStatusEffect,
  writePendingSqliteEffect,
  type TryConsumeApprovedInput as SqliteConsumeInput,
} from "./pending-execution-sqlite.js";
import type { PendingExecutionRecord, PendingExecutionStatus } from "./pending-execution-types.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const ID_PREFIX = "pex_";
const LOCK_TIMEOUT_MS = 5_000;

export type TryConsumeApprovedInput = SqliteConsumeInput;

export function getPendingExecutionsDir(home = resolveClawqlHome()): string {
  return join(home, "pending-executions");
}

export function assertSafeExecutionId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed.startsWith(ID_PREFIX)) {
    throw new Error(`Invalid executionId: must start with ${ID_PREFIX}`);
  }
  if (!/^pex_[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) {
    throw new Error("Invalid executionId format");
  }
  return trimmed;
}

export const newExecutionIdEffect = (): Effect.Effect<string> =>
  Effect.sync(() => `${ID_PREFIX}${randomBytes(16).toString("hex")}`);

function recordPath(executionId: string, home: string): string {
  const id = assertSafeExecutionId(executionId);
  return join(getPendingExecutionsDir(home), `${id}.json`);
}

function isRecord(v: unknown): v is PendingExecutionRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.executionId === "string" &&
    typeof o.operationId === "string" &&
    typeof o.argsHash === "string" &&
    typeof o.status === "string" &&
    o.args !== null &&
    typeof o.args === "object" &&
    !Array.isArray(o.args) &&
    o.risk !== null &&
    typeof o.risk === "object"
  );
}

function normalizeRecord(raw: PendingExecutionRecord): PendingExecutionRecord {
  return {
    ...raw,
    consumedAt: raw.consumedAt ?? null,
    consumedBy: raw.consumedBy ?? null,
    idempotencyCapable: raw.idempotencyCapable ?? false,
  };
}

async function withPendingFileLock<A>(path: string, fn: () => Promise<A>): Promise<A> {
  const lockPath = `${path}.lock`;
  const started = Date.now();
  for (;;) {
    try {
      const fh = await open(lockPath, "wx");
      try {
        await fh.writeFile(`${process.pid}\n`);
        return await fn();
      } finally {
        await fh.close();
        try {
          await unlink(lockPath);
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== "EEXIST") throw e;
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`pending execution lock timeout: ${path}`);
      }
      await new Promise((r) => setTimeout(r, 2 + Math.floor(Math.random() * 18)));
    }
  }
}

const readFilePending = (
  executionId: string,
  home: string
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const path = recordPath(executionId, home);
      try {
        const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
        return isRecord(raw) ? normalizeRecord(raw) : null;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

const writeFilePending = (
  record: PendingExecutionRecord,
  home: string
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const dir = getPendingExecutionsDir(home);
      await mkdir(dir, { recursive: true, mode: DIR_MODE });
      const path = recordPath(record.executionId, home);
      const normalized = normalizeRecord(record);
      await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, {
        encoding: "utf8",
        mode: FILE_MODE,
      });
      await chmod(path, FILE_MODE);
      return path;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const readPendingExecutionEffect = (
  executionId: string,
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  pendingStoreBackend() === "sqlite"
    ? readPendingSqliteEffect(executionId, home)
    : readFilePending(executionId, home);

export const writePendingExecutionEffect = (
  record: PendingExecutionRecord,
  home = resolveClawqlHome()
): Effect.Effect<string, Error> =>
  pendingStoreBackend() === "sqlite"
    ? writePendingSqliteEffect(normalizeRecord(record), home)
    : writeFilePending(record, home);

export const updatePendingStatusEffect = (
  executionId: string,
  patch: {
    readonly status: PendingExecutionStatus;
    readonly approvedAt?: string | null;
    readonly completedAt?: string | null;
    readonly lastError?: string | null;
    readonly consumedAt?: string | null;
    readonly consumedBy?: string | null;
  },
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord, Error> =>
  pendingStoreBackend() === "sqlite"
    ? updatePendingSqliteStatusEffect(executionId, patch, home)
    : Effect.gen(function* () {
        const existing = yield* readFilePending(executionId, home);
        if (!existing) {
          return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
        }
        const next: PendingExecutionRecord = {
          ...existing,
          status: patch.status,
          approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : existing.approvedAt,
          completedAt: patch.completedAt !== undefined ? patch.completedAt : existing.completedAt,
          lastError: patch.lastError !== undefined ? patch.lastError : existing.lastError,
          consumedAt: patch.consumedAt !== undefined ? patch.consumedAt : existing.consumedAt,
          consumedBy: patch.consumedBy !== undefined ? patch.consumedBy : existing.consumedBy,
        };
        yield* writeFilePending(next, home);
        return next;
      });

/**
 * Atomic consume in the shared store.
 * SQLite: one UPDATE…WHERE (cross-process). File: lockfile CAS (single-process).
 */
export const tryConsumeApprovedEffect = (
  executionId: string,
  input: TryConsumeApprovedInput,
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  pendingStoreBackend() === "sqlite"
    ? tryConsumeApprovedSqliteEffect(executionId, input, home)
    : Effect.tryPromise({
        try: async () => {
          const path = recordPath(executionId, home);
          return withPendingFileLock(path, async () => {
            let raw: unknown;
            try {
              raw = JSON.parse(await readFile(path, "utf8")) as unknown;
            } catch (e: unknown) {
              if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
              throw e;
            }
            if (!isRecord(raw)) return null;
            const existing = normalizeRecord(raw);
            const nowMs = input.nowMs ?? Date.now();
            const expiresMs = Date.parse(existing.expiresAt);
            if (
              existing.status !== "approved" ||
              existing.argsHash !== input.argsHash ||
              !Number.isFinite(expiresMs) ||
              expiresMs <= nowMs
            ) {
              return null;
            }
            const consumedAt = new Date(nowMs).toISOString();
            const next: PendingExecutionRecord = {
              ...existing,
              status: "outcome_unknown",
              consumedAt,
              consumedBy: input.consumedBy?.trim() || `pid:${process.pid}`,
              lastError: null,
            };
            await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, {
              encoding: "utf8",
              mode: FILE_MODE,
            });
            await chmod(path, FILE_MODE);
            return next;
          });
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });

export const listPendingExecutionIdsEffect = (
  home = resolveClawqlHome()
): Effect.Effect<readonly string[], Error> =>
  pendingStoreBackend() === "sqlite"
    ? listPendingSqliteIdsEffect(home)
    : Effect.tryPromise({
        try: async () => {
          const dir = getPendingExecutionsDir(home);
          try {
            const names = await readdir(dir);
            return names
              .filter((n) => n.startsWith(ID_PREFIX) && n.endsWith(".json"))
              .map((n) => n.slice(0, -".json".length));
          } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
            throw e;
          }
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });

export const deletePendingExecutionEffect = (
  executionId: string,
  home = resolveClawqlHome()
): Effect.Effect<void, Error> =>
  pendingStoreBackend() === "sqlite"
    ? deletePendingSqliteEffect(executionId, home)
    : Effect.tryPromise({
        try: async () => {
          try {
            await unlink(recordPath(executionId, home));
          } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return;
            throw e;
          }
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      });

export function pendingTtlHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CLAWQL_PENDING_EXECUTION_TTL_HOURS?.trim();
  const n = raw ? Number(raw) : 24;
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(n, 24 * 30);
}

export {
  CONSUME_SQL,
  pendingSqlitePath,
  resetPendingSqliteCacheForTests,
} from "./pending-execution-sqlite.js";
export { pendingStoreBackend } from "./pending-store-backend.js";
