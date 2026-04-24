/**
 * Dedicated Postgres pool for Ouroboros event store (CLAWQL_OUROBOROS_DATABASE_URL).
 * Separate from CLAWQL_VECTOR_DATABASE_URL so lineages can target a different DB when needed.
 */

import pg from "pg";
import { runOuroborosPostgresMigrations } from "../memory-backends/ouroboros-postgres-migrations.js";

let pool: pg.Pool | null = null;
let migrationsDone = false;
let shutdownHooksRegistered = false;

export function getOuroborosPgPool(): pg.Pool | null {
  const url = process.env.CLAWQL_OUROBOROS_DATABASE_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 4 });
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
