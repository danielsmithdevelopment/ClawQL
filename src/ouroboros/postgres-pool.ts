/**
 * Dedicated Postgres pool for Ouroboros event store (CLAWQL_OUROBOROS_DATABASE_URL).
 * Separate from CLAWQL_VECTOR_DATABASE_URL so lineages can target a different DB when needed.
 */

import pg from "pg";
import { runOuroborosPostgresMigrations } from "../memory-backends/ouroboros-postgres-migrations.js";

let pool: pg.Pool | null = null;
let migrationsDone = false;
let shutdownHooksRegistered = false;

type OuroborosPgPoolConfig = string | pg.PoolConfig | null;

function parsePort(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function resolveOuroborosPoolConfig(env: NodeJS.ProcessEnv = process.env): OuroborosPgPoolConfig {
  const url = env.CLAWQL_OUROBOROS_DATABASE_URL?.trim();
  if (url) return url;

  const host = env.CLAWQL_OUROBOROS_DB_HOST?.trim();
  const user = env.CLAWQL_OUROBOROS_DB_USER?.trim();
  const password = env.CLAWQL_OUROBOROS_DB_PASSWORD ?? "";
  const database = env.CLAWQL_OUROBOROS_DB_NAME?.trim();
  if (!host || !user || !database) return null;

  return {
    host,
    user,
    password,
    database,
    port: parsePort(env.CLAWQL_OUROBOROS_DB_PORT),
    max: 4,
  };
}

export function getOuroborosPgPool(): pg.Pool | null {
  const config = resolveOuroborosPoolConfig();
  if (!config) return null;
  if (!pool) {
    pool = typeof config === "string" ? new pg.Pool({ connectionString: config, max: 4 }) : new pg.Pool(config);
  }
  return pool;
}

export async function ensureOuroborosSchema(): Promise<void> {
  const p = getOuroborosPgPool();
  if (!p || migrationsDone) return;
  const client = await p.connect();
  try {
    await runOuroborosPostgresMigrations(client);
    migrationsDone = true;
  } finally {
    client.release();
  }
}

export async function closeOuroborosPgPool(): Promise<void> {
  migrationsDone = false;
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function registerOuroborosPoolShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const onSignal = (): void => {
    void closeOuroborosPgPool().catch(() => {});
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

export const __testUtils = {
  resolveOuroborosPoolConfig,
};
