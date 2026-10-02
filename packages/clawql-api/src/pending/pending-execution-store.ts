/**
 * Persist parked execute calls under $CLAWQL_HOME/pending-executions/.
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import type { PendingExecutionRecord, PendingExecutionStatus } from "./pending-execution-types.js";

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;
const ID_PREFIX = "pex_";

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

export const readPendingExecutionEffect = (
  executionId: string,
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const path = recordPath(executionId, home);
      try {
        const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
        return isRecord(raw) ? raw : null;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const writePendingExecutionEffect = (
  record: PendingExecutionRecord,
  home = resolveClawqlHome()
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const dir = getPendingExecutionsDir(home);
      await mkdir(dir, { recursive: true, mode: DIR_MODE });
      const path = recordPath(record.executionId, home);
      await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: "utf8",
        mode: FILE_MODE,
      });
      await chmod(path, FILE_MODE);
      return path;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const updatePendingStatusEffect = (
  executionId: string,
  patch: {
    readonly status: PendingExecutionStatus;
    readonly approvedAt?: string | null;
    readonly completedAt?: string | null;
    readonly lastError?: string | null;
  },
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord, Error> =>
  Effect.gen(function* () {
    const existing = yield* readPendingExecutionEffect(executionId, home);
    if (!existing) {
      return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
    }
    const next: PendingExecutionRecord = {
      ...existing,
      status: patch.status,
      approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : existing.approvedAt,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : existing.completedAt,
      lastError: patch.lastError !== undefined ? patch.lastError : existing.lastError,
    };
    yield* writePendingExecutionEffect(next, home);
    return next;
  });

export const listPendingExecutionIdsEffect = (
  home = resolveClawqlHome()
): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise({
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
  Effect.tryPromise({
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
