import { createHash } from "node:crypto";
import { getInferencePgPool } from "../store/postgres-pool.js";

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
export async function tryAcquirePipelineAdvisoryLock(
  lockKey: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<PipelineAdvisoryLockResult> {
  const pool = getInferencePgPool(env);
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
    client.release();
    return { acquired: true, backend: "none", release: async () => {} };
  }
}
