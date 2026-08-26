/**
 * Env → WORM trail config. Effect-primary; null when durable WORM is disabled.
 *
 * CLAWQL_WORM_ENABLED=1 enables the process trail.
 * CLAWQL_WORM_LOCAL=memory|sqlite|postgres (default: sqlite when path set, else memory)
 * CLAWQL_WORM_REMOTE=memory|s3 (default: memory)
 * CLAWQL_WORM_SQLITE_PATH, CLAWQL_WORM_POSTGRES_URL, CLAWQL_WORM_S3_* for backends
 */

import { Effect } from "effect";
import { AuditError } from "./errors.js";
import { MemoryBackend } from "./storage/memory.js";
import { PostgresBackend } from "./storage/postgres.js";
import { S3Backend } from "./storage/s3.js";
import { SQLiteBackend } from "./storage/sqlite.js";
import type { LocalStorageBackend, StorageBackend } from "./storage/types.js";
import type { WORMAuditTrailConfig } from "./trail.js";

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

export const wormEnabledFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => envTrim(env, "CLAWQL_WORM_ENABLED") === "1");

export const defaultWormSessionId = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(
    () =>
      envTrim(env, "CLAWQL_WORM_SESSION_ID") ??
      envTrim(env, "CLAWQL_SESSION_ID") ??
      "clawql-host"
  );

export const defaultWormAgentName = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string | undefined> =>
  Effect.sync(() => envTrim(env, "CLAWQL_WORM_AGENT_NAME"));

function makeLocal(
  env: NodeJS.ProcessEnv
): Effect.Effect<LocalStorageBackend, AuditError> {
  return Effect.try({
    try: () => {
      const mode =
        envTrim(env, "CLAWQL_WORM_LOCAL") ??
        (envTrim(env, "CLAWQL_WORM_SQLITE_PATH")
          ? "sqlite"
          : envTrim(env, "CLAWQL_WORM_POSTGRES_URL")
            ? "postgres"
            : "memory");
      if (mode === "memory") return new MemoryBackend();
      if (mode === "sqlite") {
        const path =
          envTrim(env, "CLAWQL_WORM_SQLITE_PATH") ?? "./data/clawql-worm.sqlite";
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

function makeRemote(
  env: NodeJS.ProcessEnv
): Effect.Effect<StorageBackend, AuditError> {
  return Effect.try({
    try: () => {
      const mode = envTrim(env, "CLAWQL_WORM_REMOTE") ?? "memory";
      if (mode === "memory") return new MemoryBackend();
      if (mode === "s3") {
        const bucket = envTrim(env, "CLAWQL_WORM_S3_BUCKET");
        if (!bucket) {
          throw new Error("CLAWQL_WORM_REMOTE=s3 requires CLAWQL_WORM_S3_BUCKET");
        }
        const accessKeyId = envTrim(env, "CLAWQL_WORM_S3_ACCESS_KEY_ID");
        const secretAccessKey = envTrim(env, "CLAWQL_WORM_S3_SECRET_ACCESS_KEY");
        return new S3Backend({
          bucket,
          endpoint: envTrim(env, "CLAWQL_WORM_S3_ENDPOINT"),
          region: envTrim(env, "CLAWQL_WORM_S3_REGION") ?? "auto",
          prefix: envTrim(env, "CLAWQL_WORM_S3_PREFIX") ?? "worm/",
          credentials:
            accessKeyId && secretAccessKey
              ? { accessKeyId, secretAccessKey }
              : undefined,
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
 * Build trail config from env, or `null` when `CLAWQL_WORM_ENABLED` is not `1`.
 */
export const createWormTrailConfigFromEnvEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<WORMAuditTrailConfig | null, AuditError> =>
  Effect.gen(function* () {
    if (!(yield* wormEnabledFromEnv(env))) return null;
    const local = yield* makeLocal(env);
    const remote = yield* makeRemote(env);
    const httpPort = parseIntEnv(env, "CLAWQL_WORM_HTTP_PORT");
    return {
      local,
      remote,
      retryMaxAttempts: parseIntEnv(env, "CLAWQL_WORM_RETRY_MAX"),
      retryBackoffMs: parseIntEnv(env, "CLAWQL_WORM_RETRY_BACKOFF_MS"),
      reconcileIntervalMs: parseIntEnv(env, "CLAWQL_WORM_RECONCILE_MS") ?? 2000,
      merkleBatchSize: parseIntEnv(env, "CLAWQL_WORM_MERKLE_BATCH") ?? 100,
      httpPort,
      apiKey: envTrim(env, "CLAWQL_AUDIT_API_KEY") ?? envTrim(env, "CLAWQL_WORM_API_KEY"),
    } satisfies WORMAuditTrailConfig;
  });
