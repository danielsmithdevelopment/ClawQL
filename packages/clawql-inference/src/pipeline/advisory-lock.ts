import { createHash } from "node:crypto";
import { getInferencePgPool } from "../store/postgres-pool.js";
import { Effect } from "effect";

export type PipelineAdvisoryLockResult = {
  acquired: boolean;
  backend: "postgres" | "none";
  release: () => Promise<void>;
};

/** Stable bigint advisory-lock key for a pipeline schedule + UTC minute bucket. */
export function pipelineAdvisoryLockId(lockKey: string): string {
  const hash = createHash("sha256").update(lockKey).digest();
  const slice = hash.subarray(0, 8);
  let value = 0n;
  for (const byte of slice) value = (value << 8n) | BigInt(byte);
  const maxSigned = (1n << 63n) - 1n;
  if (value > maxSigned) value -= 1n << 64n;
  return value.toString();
}

export function buildPipelineRunLockKey(schedule: string, minuteKey: string): string {
  return `inference-pipeline:${schedule}:${minuteKey}`;
}

/**
 * Try to acquire a session-level Postgres advisory lock for one pipeline tick.
 * When inference Postgres is not configured, returns acquired=true (caller may use in-process dedup).
 */
async function tryAcquirePipelineAdvisoryLockImpl(
  lockKey: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: { getPool?: typeof getInferencePgPool } = {}
): Promise<PipelineAdvisoryLockResult> {
  const pool = (deps.getPool ?? getInferencePgPool)(env);
  if (!pool) {
    return { acquired: true, backend: "none", release: async () => {} };
  }

  const lockId = pipelineAdvisoryLockId(lockKey);
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
      [lockId]
    );
    const acquired = Boolean(result.rows[0]?.acquired);
    if (!acquired) {
      client.release();
      return { acquired: false, backend: "postgres", release: async () => {} };
    }
    return {
      acquired: true,
      backend: "postgres",
      release: async () => {
        try {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockId]);
        } finally {
          client.release();
        }
      },
    };
  } catch {
    // Fail closed: a Postgres error must not grant a phantom lock (duplicate ticks).
    try {
      client.release();
    } catch {
      /* ignore */
    }
    return { acquired: false, backend: "postgres", release: async () => {} };
  }
}

export function tryAcquirePipelineAdvisoryLockEffect(
  lockKey: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: { getPool?: typeof getInferencePgPool } = {}
): Effect.Effect<PipelineAdvisoryLockResult, Error> {
  return Effect.tryPromise({
    try: () => tryAcquirePipelineAdvisoryLockImpl(lockKey, env, deps),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link tryAcquirePipelineAdvisoryLockEffect} for Effect callers. */
export async function tryAcquirePipelineAdvisoryLock(
  lockKey: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: { getPool?: typeof getInferencePgPool } = {}
): Promise<PipelineAdvisoryLockResult> {
  return Effect.runPromise(tryAcquirePipelineAdvisoryLockEffect(lockKey, env, deps));
}
