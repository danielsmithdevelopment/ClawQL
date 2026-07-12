import pg from "pg";
import { runInferencePostgresMigrations } from "./postgres-migrations.js";

let pool: pg.Pool | null = null;
let migrationsDone = false;
let shutdownHooksRegistered = false;

type InferencePgPoolConfig = string | pg.PoolConfig | null;

function parsePort(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function resolveInferencePoolConfig(env: NodeJS.ProcessEnv = process.env): InferencePgPoolConfig {
  const url = env.CLAWQL_INFERENCE_DATABASE_URL?.trim();
  if (url) return url;

  const host = env.CLAWQL_INFERENCE_DB_HOST?.trim();
  const user = env.CLAWQL_INFERENCE_DB_USER?.trim();
  const password = env.CLAWQL_INFERENCE_DB_PASSWORD ?? "";
  const database = env.CLAWQL_INFERENCE_DB_NAME?.trim();
  if (!host || !user || !database) return null;

  return {
    host,
    user,
    password,
    database,
    port: parsePort(env.CLAWQL_INFERENCE_DB_PORT),
    max: 4,
  };
}

export function getInferencePgPool(env: NodeJS.ProcessEnv = process.env): pg.Pool | null {
  const config = resolveInferencePoolConfig(env);
  if (!config) return null;
  if (!pool) {
    pool =
      typeof config === "string"
        ? new pg.Pool({ connectionString: config, max: 4 })
        : new pg.Pool(config);
  }
  return pool;
}

export async function ensureInferenceSchema(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const p = getInferencePgPool(env);
  if (!p || migrationsDone) return;
  const client = await p.connect();
  try {
    await runInferencePostgresMigrations(client);
    migrationsDone = true;
  } finally {
    client.release();
  }
}

export async function closeInferencePgPool(): Promise<void> {
  migrationsDone = false;
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function registerInferencePoolShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const onSignal = (): void => {
    void closeInferencePgPool().catch(() => {});
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

export const __testUtils = {
  resolveInferencePoolConfig,
};
