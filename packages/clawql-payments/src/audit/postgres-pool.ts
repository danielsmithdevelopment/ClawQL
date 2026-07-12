import pg from "pg";
import { runPaymentsAuditPostgresMigrations } from "./postgres-migrations.js";

let pool: pg.Pool | null = null;
let poolKey: string | null = null;
let migrationsDone = false;
let shutdownHooksRegistered = false;

type PaymentsPgPoolConfig = string | pg.PoolConfig | null;

function parsePort(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export function resolvePaymentsPoolConfig(env: NodeJS.ProcessEnv = process.env): PaymentsPgPoolConfig {
  const url =
    env.CLAWQL_PAYMENTS_DATABASE_URL?.trim() || env.CLAWQL_INFERENCE_DATABASE_URL?.trim();
  if (url) return url;

  const host = env.CLAWQL_PAYMENTS_DB_HOST?.trim();
  const user = env.CLAWQL_PAYMENTS_DB_USER?.trim();
  const password = env.CLAWQL_PAYMENTS_DB_PASSWORD ?? "";
  const database = env.CLAWQL_PAYMENTS_DB_NAME?.trim();
  if (!host || !user || !database) return null;

  return {
    host,
    user,
    password,
    database,
    port: parsePort(env.CLAWQL_PAYMENTS_DB_PORT),
    max: 4,
  };
}

function poolConfigKey(config: PaymentsPgPoolConfig): string {
  if (!config) return "";
  return typeof config === "string" ? config : JSON.stringify(config);
}

export function getPaymentsAuditPgPool(env: NodeJS.ProcessEnv = process.env): pg.Pool | null {
  const config = resolvePaymentsPoolConfig(env);
  if (!config) return null;

  const key = poolConfigKey(config);
  if (!pool || poolKey !== key) {
    pool =
      typeof config === "string"
        ? new pg.Pool({ connectionString: config, max: 4 })
        : new pg.Pool(config);
    poolKey = key;
    migrationsDone = false;
  }
  return pool;
}

export async function ensurePaymentsAuditSchema(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const p = getPaymentsAuditPgPool(env);
  if (!p || migrationsDone) return;
  const client = await p.connect();
  try {
    await runPaymentsAuditPostgresMigrations(client);
    migrationsDone = true;
  } finally {
    client.release();
  }
}

export async function closePaymentsAuditPgPool(): Promise<void> {
  migrationsDone = false;
  poolKey = null;
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function registerPaymentsAuditPoolShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const onSignal = (): void => {
    void closePaymentsAuditPgPool().catch(() => {});
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

export const __testUtils = {
  resolvePaymentsPoolConfig,
};
