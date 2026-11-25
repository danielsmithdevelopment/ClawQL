/**
 * Env → WORM trail config. Effect-primary; null when durable WORM is disabled.
 *
 * Hash-chained local WORM is on by default. Set CLAWQL_WORM_ENABLED=0 to disable
 * (writes a final hash-chained WORM_DISABLED entry first when a trail was active;
 * ECDSA signatures require CLAWQL_WORM_TEE=1 with a persistent key under $CLAWQL_HOME/worm).
 * CLAWQL_WORM_LOCAL=sqlite|postgres|memory — default **sqlite** under
 * `$CLAWQL_HOME/worm/clawql-worm.sqlite` (or `~/.ClawQL/worm/...` when unset).
 * Memory is tests-only: set `CLAWQL_WORM_LOCAL=memory` explicitly (startup warns).
 * CLAWQL_WORM_REMOTE=memory|s3 (default: memory dual-ack peer; not durable alone)
 * CLAWQL_TIER=regulated refuses memory local or memory remote.
 * CLAWQL_WORM_MEMORY_MAX_ENTRIES — ring cap for memory backend (default 10000; 0 = unbounded)
 * CLAWQL_WORM_SQLITE_PATH, CLAWQL_WORM_POSTGRES_URL, CLAWQL_WORM_S3_* for backends
 * CLAWQL_WORM_S3_OBJECT_LOCK=compliance|governance|0 — storage WORM (S3/MinIO Object Lock).
 *   Cloudflare R2 does not support the S3 Object Lock API; use 0 for R2.
 * CLAWQL_WORM_S3_OBJECT_LOCK_DAYS — retention days (default 365; S3 minimum 1).
 * CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK=1 — boot-check bucket Object Lock Enabled.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { AuditError } from "./errors.js";
import { MemoryBackend, memoryBackendMaxEntriesFromEnv } from "./storage/memory.js";
import { PostgresBackend } from "./storage/postgres.js";
import { S3Backend, type S3ObjectLockMode } from "./storage/s3.js";
import { SQLiteBackend } from "./storage/sqlite.js";
import type { LocalStorageBackend, StorageBackend } from "./storage/types.js";
import { createWormTeeSignerFromEnvEffect } from "./tee/env.js";
import type { WORMAuditTrailConfig } from "./trail.js";

export type WormBackendKind = "memory" | "sqlite" | "postgres" | "s3";

export type WormBackendStatus = {
  readonly local: WormBackendKind;
  readonly remote: WormBackendKind;
  /** True when local is sqlite or postgres (survives process restart). */
  readonly localDurable: boolean;
};

function parseObjectLockMode(raw: string | undefined): S3ObjectLockMode | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "0" || v === "off" || v === "false" || v === "none") return undefined;
  if (v === "1" || v === "true" || v === "compliance") return "COMPLIANCE";
  if (v === "governance") return "GOVERNANCE";
  throw new Error(`CLAWQL_WORM_S3_OBJECT_LOCK must be compliance|governance|0 (got ${raw})`);
}

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v || undefined;
}

function parseIntEnv(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const raw = envTrim(env, key);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function clawqlHomeFromEnv(env: NodeJS.ProcessEnv): string {
  const raw = envTrim(env, "CLAWQL_HOME");
  if (raw) return resolve(raw);
  return resolve(homedir(), ".ClawQL");
}

/** Default SQLite path: `$CLAWQL_HOME/worm/clawql-worm.sqlite`. */
export const defaultWormSqlitePath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(clawqlHomeFromEnv(env), "worm", "clawql-worm.sqlite");

function tierIsRegulated(env: NodeJS.ProcessEnv): boolean {
  return envTrim(env, "CLAWQL_TIER")?.toLowerCase() === "regulated";
}

function backendKind(backend: StorageBackend): WormBackendKind {
  if (backend instanceof MemoryBackend) return "memory";
  if (backend instanceof SQLiteBackend) return "sqlite";
  if (backend instanceof PostgresBackend) return "postgres";
  if (backend instanceof S3Backend) return "s3";
  return "memory";
}

export const wormBackendStatusFromConfig = (config: WORMAuditTrailConfig): WormBackendStatus => {
  const local = backendKind(config.local);
  const remote = backendKind(config.remote);
  return {
    local,
    remote,
    localDurable: local === "sqlite" || local === "postgres",
  };
};

/** True unless explicitly disabled (`0` / `false` / `off` / `no`). */
export const wormEnabledFromEnv = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const raw = envTrim(env, "CLAWQL_WORM_ENABLED")?.toLowerCase();
    if (raw === undefined) return true;
    if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
    return true;
  });

export const defaultWormSessionId = (env: NodeJS.ProcessEnv = process.env): Effect.Effect<string> =>
  Effect.sync(
    () =>
      envTrim(env, "CLAWQL_WORM_SESSION_ID") ?? envTrim(env, "CLAWQL_SESSION_ID") ?? "clawql-host"
  );

export const defaultWormAgentName = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string | undefined> => Effect.sync(() => envTrim(env, "CLAWQL_WORM_AGENT_NAME"));

function makeLocal(env: NodeJS.ProcessEnv): Effect.Effect<LocalStorageBackend, AuditError> {
  return Effect.try({
    try: () => {
      const explicit = envTrim(env, "CLAWQL_WORM_LOCAL")?.toLowerCase();
      const mode =
        explicit ??
        (envTrim(env, "CLAWQL_WORM_POSTGRES_URL")
          ? "postgres"
          : // Default durable local store (not memory). Path may still be overridden.
            "sqlite");
      if (mode === "memory") {
        if (tierIsRegulated(env)) {
          throw new Error(
            "CLAWQL_TIER=regulated refuses CLAWQL_WORM_LOCAL=memory. " +
              "Use sqlite (default) or postgres."
          );
        }
        process.stderr.write(
          "[clawql-audit] WARNING: CLAWQL_WORM_LOCAL=memory — entries are not durable " +
            "(evicted / lost on restart). Use sqlite (default) or postgres for write-once storage.\n"
        );
        return new MemoryBackend({ maxEntries: memoryBackendMaxEntriesFromEnv(env) });
      }
      if (mode === "sqlite") {
        const path = envTrim(env, "CLAWQL_WORM_SQLITE_PATH") ?? defaultWormSqlitePath(env);
        return new SQLiteBackend({ path });
      }
      if (mode === "postgres") {
        const connectionString = envTrim(env, "CLAWQL_WORM_POSTGRES_URL");
        if (!connectionString) {
          throw new Error("CLAWQL_WORM_LOCAL=postgres requires CLAWQL_WORM_POSTGRES_URL");
        }
        return new PostgresBackend({ connectionString });
      }
      throw new Error(`Unknown CLAWQL_WORM_LOCAL=${mode}`);
    },
    catch: (cause) =>
      new AuditError({
        reason: `WORM local backend config failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

function makeRemote(env: NodeJS.ProcessEnv): Effect.Effect<StorageBackend, AuditError> {
  return Effect.try({
    try: () => {
      const mode = envTrim(env, "CLAWQL_WORM_REMOTE")?.toLowerCase() ?? "memory";
      if (mode === "memory") {
        if (tierIsRegulated(env)) {
          throw new Error(
            "CLAWQL_TIER=regulated refuses CLAWQL_WORM_REMOTE=memory. " +
              "Set CLAWQL_WORM_REMOTE=s3 with Object Lock (Cloud paid / regulated defaults)."
          );
        }
        return new MemoryBackend({ maxEntries: memoryBackendMaxEntriesFromEnv(env) });
      }
      if (mode === "s3") {
        const bucket = envTrim(env, "CLAWQL_WORM_S3_BUCKET");
        if (!bucket) {
          throw new Error("CLAWQL_WORM_REMOTE=s3 requires CLAWQL_WORM_S3_BUCKET");
        }
        const accessKeyId = envTrim(env, "CLAWQL_WORM_S3_ACCESS_KEY_ID");
        const secretAccessKey = envTrim(env, "CLAWQL_WORM_S3_SECRET_ACCESS_KEY");
        const lockMode = parseObjectLockMode(envTrim(env, "CLAWQL_WORM_S3_OBJECT_LOCK"));
        const lockDays = parseIntEnv(env, "CLAWQL_WORM_S3_OBJECT_LOCK_DAYS") ?? 365;
        return new S3Backend({
          bucket,
          endpoint: envTrim(env, "CLAWQL_WORM_S3_ENDPOINT"),
          region: envTrim(env, "CLAWQL_WORM_S3_REGION") ?? "auto",
          prefix: envTrim(env, "CLAWQL_WORM_S3_PREFIX") ?? "worm/",
          forcePathStyle: envTrim(env, "CLAWQL_WORM_S3_FORCE_PATH_STYLE") === "1",
          credentials:
            accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
          ...(lockMode
            ? { objectLock: { mode: lockMode, retainDays: Math.max(1, lockDays) } }
            : {}),
        });
      }
      throw new Error(`Unknown CLAWQL_WORM_REMOTE=${mode}`);
    },
    catch: (cause) =>
      new AuditError({
        reason: `WORM remote backend config failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      }),
  });
}

/**
 * Build trail config from env, or `null` when WORM is explicitly disabled.
 */
export const createWormTrailConfigFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<WORMAuditTrailConfig | null, AuditError> =>
  Effect.gen(function* () {
    if (!(yield* wormEnabledFromEnv(env))) return null;
    const local = yield* makeLocal(env);
    const remote = yield* makeRemote(env);
    if (
      remote instanceof S3Backend &&
      remote.hasObjectLockWorm &&
      envTrim(env, "CLAWQL_WORM_S3_VERIFY_OBJECT_LOCK") === "1"
    ) {
      yield* remote.verifyBucketObjectLockEnabled();
    }
    const tee = yield* createWormTeeSignerFromEnvEffect(env);
    const httpPort = parseIntEnv(env, "CLAWQL_WORM_HTTP_PORT");
    return {
      local,
      remote,
      ...(tee ? { tee } : {}),
      retryMaxAttempts: parseIntEnv(env, "CLAWQL_WORM_RETRY_MAX"),
      retryBackoffMs: parseIntEnv(env, "CLAWQL_WORM_RETRY_BACKOFF_MS"),
      reconcileIntervalMs: parseIntEnv(env, "CLAWQL_WORM_RECONCILE_MS") ?? 2000,
      merkleBatchSize: parseIntEnv(env, "CLAWQL_WORM_MERKLE_BATCH") ?? 100,
      httpPort,
      apiKey: envTrim(env, "CLAWQL_AUDIT_API_KEY") ?? envTrim(env, "CLAWQL_WORM_API_KEY"),
    } satisfies WORMAuditTrailConfig;
  });
