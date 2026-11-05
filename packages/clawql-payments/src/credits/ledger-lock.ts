/**
 * Tenant ledger mutual exclusion — multi-node capable.
 *
 * Mirrors formal/tla/payments/PaymentsLedgerLock.tla:
 * acquire with a fencing token → critical section → compare-and-delete release.
 *
 * Backends (resolved from env, first match wins):
 * 1. CLAWQL_PAYMENTS_LEDGER_LOCK_URL | CLAWQL_VALKEY_URL | CLAWQL_REDIS_URL → Valkey/Redis SET NX PX
 * 2. Payments Postgres pool → session advisory lock (reuse existing pg)
 * 3. Else in-process Map (single-node default)
 */

import { createHash, randomUUID } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import type pg from "pg";
import { getPaymentsAuditPgPool } from "../audit/postgres-pool.js";

export type LedgerLockBackend = "inprocess" | "redis" | "postgres";

export class LedgerLockError extends Data.TaggedError("LedgerLockError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Minimal RESP client surface for Valkey/Redis fencing locks. */
export type RedisLockClient = {
  readonly setNxPx: (key: string, token: string, ttlMs: number) => Promise<boolean>;
  readonly compareAndDelete: (key: string, token: string) => Promise<boolean>;
  readonly quit?: () => Promise<void>;
};

export type TenantLedgerLockApi = {
  readonly backend: LedgerLockBackend;
  /**
   * Host-boundary mutex. Errors thrown by `fn` propagate unchanged (ledger domain
   * errors must not be rewritten as LedgerLockError).
   */
  readonly withLockRaw: <A>(tenantId: string, fn: () => Promise<A>) => Promise<A>;
  readonly withLock: <A>(
    tenantId: string,
    fn: () => Promise<A>
  ) => Effect.Effect<A, LedgerLockError>;
};

function lockEffectFromRaw(
  raw: TenantLedgerLockApi["withLockRaw"]
): TenantLedgerLockApi["withLock"] {
  return <A>(tenantId: string, fn: () => Promise<A>) =>
    Effect.tryPromise({
      try: () => raw(tenantId, fn),
      catch: (cause) =>
        cause instanceof LedgerLockError
          ? cause
          : new LedgerLockError({
              reason:
                cause && typeof cause === "object" && "reason" in cause
                  ? String((cause as { reason: unknown }).reason)
                  : cause instanceof Error
                    ? cause.message
                    : String(cause),
              cause,
            }),
    });
}

export class TenantLedgerLock extends Context.Service<TenantLedgerLock, TenantLedgerLockApi>()(
  "clawql/TenantLedgerLock"
) {}

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_WAIT_MS = 15_000;
const SPIN_MS = 25;

export function ledgerLockKey(tenantId: string): string {
  const t = tenantId.trim() || "default";
  return `clawql:payments:ledger-lock:${t}`;
}

export function resolveLedgerLockRedisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw =
    env.CLAWQL_PAYMENTS_LEDGER_LOCK_URL?.trim() ||
    env.CLAWQL_VALKEY_URL?.trim() ||
    env.CLAWQL_REDIS_URL?.trim() ||
    "";
  return raw || null;
}

export function ledgerLockTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CLAWQL_PAYMENTS_LEDGER_LOCK_TTL_MS?.trim());
  if (Number.isFinite(n) && n >= 1000) return Math.floor(n);
  return DEFAULT_TTL_MS;
}

export function ledgerLockWaitMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CLAWQL_PAYMENTS_LEDGER_LOCK_WAIT_MS?.trim());
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable signed bigint for pg_advisory_lock from a tenant key. */
export function tenantLedgerAdvisoryLockId(tenantId: string): string {
  const hash = createHash("sha256").update(ledgerLockKey(tenantId)).digest();
  const slice = hash.subarray(0, 8);
  let value = 0n;
  for (const byte of slice) value = (value << 8n) | BigInt(byte);
  const maxSigned = (1n << 63n) - 1n;
  if (value > maxSigned) value -= 1n << 64n;
  return value.toString();
}

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export function createInProcessTenantLedgerLock(): TenantLedgerLockApi {
  const gates = new Map<string, Promise<unknown>>();
  const withLockRaw = async <A>(tenantId: string, fn: () => Promise<A>): Promise<A> => {
    const key = tenantId.trim() || "default";
    const prev = gates.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prev.then(() => gate);
    gates.set(
      key,
      chained.catch(() => undefined)
    );
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (gates.get(key) === chained) gates.delete(key);
    }
  };
  return {
    backend: "inprocess",
    withLockRaw,
    withLock: lockEffectFromRaw(withLockRaw),
  };
}

export function createRedisTenantLedgerLock(
  client: RedisLockClient,
  opts: { readonly ttlMs?: number; readonly waitMs?: number } = {}
): TenantLedgerLockApi {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const withLockRaw = async <A>(tenantId: string, fn: () => Promise<A>): Promise<A> => {
    const key = ledgerLockKey(tenantId);
    const token = randomUUID();
    const deadline = Date.now() + waitMs;
    let acquired = false;
    while (!acquired) {
      acquired = await client.setNxPx(key, token, ttlMs);
      if (acquired) break;
      if (Date.now() >= deadline) {
        throw new LedgerLockError({
          reason: `ledger lock wait exceeded for tenant ${tenantId.trim() || "default"}`,
        });
      }
      await sleep(SPIN_MS);
    }
    try {
      return await fn();
    } finally {
      await client.compareAndDelete(key, token);
    }
  };
  return {
    backend: "redis",
    withLockRaw,
    withLock: lockEffectFromRaw(withLockRaw),
  };
}

/** Build RedisLockClient from node-redis style client (set / eval). */
export function redisLockClientFromNodeRedis(client: {
  set: (key: string, value: string, opts: { NX: true; PX: number }) => Promise<string | null>;
  eval: (script: string, opts: { keys: string[]; arguments: string[] }) => Promise<unknown>;
}): RedisLockClient {
  return {
    setNxPx: async (key, token, ttlMs) => {
      const r = await client.set(key, token, { NX: true, PX: ttlMs });
      return r === "OK";
    },
    compareAndDelete: async (key, token) => {
      const r = await client.eval(RELEASE_LUA, { keys: [key], arguments: [token] });
      return Number(r) === 1;
    },
  };
}

type NodeRedisModule = {
  createClient: (opts: { url: string }) => {
    connect: () => Promise<unknown>;
    set: (key: string, value: string, o: { NX: true; PX: number }) => Promise<string | null>;
    eval: (script: string, o: { keys: string[]; arguments: string[] }) => Promise<unknown>;
    quit: () => Promise<unknown>;
  };
};

export async function tryCreateRedisTenantLedgerLockFromUrl(
  url: string,
  opts: { readonly ttlMs?: number; readonly waitMs?: number } = {}
): Promise<TenantLedgerLockApi | null> {
  try {
    // Optional peer — dynamic load so default installs stay redis-free.
    const mod = (await import(/* @vite-ignore */ "redis" as string)) as NodeRedisModule;
    const raw = mod.createClient({ url });
    await raw.connect();
    const base = redisLockClientFromNodeRedis(raw);
    const client: RedisLockClient = {
      ...base,
      quit: async () => {
        await raw.quit();
      },
    };
    return createRedisTenantLedgerLock(client, opts);
  } catch {
    return null;
  }
}

export function createPostgresTenantLedgerLock(
  pool: pg.Pool,
  opts: { readonly waitMs?: number } = {}
): TenantLedgerLockApi {
  const waitMs = opts.waitMs ?? DEFAULT_WAIT_MS;
  const withLockRaw = async <A>(tenantId: string, fn: () => Promise<A>): Promise<A> => {
    const lockId = tenantLedgerAdvisoryLockId(tenantId);
    const deadline = Date.now() + waitMs;
    const client = await pool.connect();
    try {
      let acquired = false;
      while (!acquired) {
        const result = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
          [lockId]
        );
        acquired = Boolean(result.rows[0]?.acquired);
        if (acquired) break;
        if (Date.now() >= deadline) {
          throw new LedgerLockError({
            reason: `postgres ledger lock wait exceeded for tenant ${tenantId.trim() || "default"}`,
          });
        }
        await sleep(SPIN_MS);
      }
      try {
        return await fn();
      } finally {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockId]);
      }
    } finally {
      client.release();
    }
  };
  return {
    backend: "postgres",
    withLockRaw,
    withLock: lockEffectFromRaw(withLockRaw),
  };
}

let cached: { key: string; lock: TenantLedgerLockApi } | null = null;

function cacheKey(env: NodeJS.ProcessEnv): string {
  return [
    resolveLedgerLockRedisUrl(env) ?? "",
    resolvePaymentsPoolPresent(env) ? "pg" : "",
    String(ledgerLockTtlMs(env)),
    String(ledgerLockWaitMs(env)),
  ].join("|");
}

function resolvePaymentsPoolPresent(env: NodeJS.ProcessEnv): boolean {
  return Boolean(getPaymentsAuditPgPool(env));
}

/**
 * Resolve process-wide ledger lock. Prefer Valkey/Redis URL; else Postgres advisory;
 * else in-process. Redis URL without a usable `redis` package fails closed (throws on use
 * via a sentinel that errors) — callers must not silently fall back on multi-node.
 */
export function resolveTenantLedgerLock(env: NodeJS.ProcessEnv = process.env): TenantLedgerLockApi {
  const key = cacheKey(env);
  if (cached?.key === key) return cached.lock;

  const redisUrl = resolveLedgerLockRedisUrl(env);
  if (redisUrl) {
    // Lazy connect on first withLock — sync resolve returns a proxy.
    let inner: TenantLedgerLockApi | null = null;
    let initError: LedgerLockError | null = null;
    let initPromise: Promise<void> | null = null;
    const ensure = async () => {
      if (inner || initError) return;
      if (!initPromise) {
        initPromise = (async () => {
          const created = await tryCreateRedisTenantLedgerLockFromUrl(redisUrl, {
            ttlMs: ledgerLockTtlMs(env),
            waitMs: ledgerLockWaitMs(env),
          });
          if (!created) {
            initError = new LedgerLockError({
              reason:
                "CLAWQL_* ledger lock URL set but redis client unavailable — install optional `redis` package or unset the URL",
            });
            return;
          }
          inner = created;
        })();
      }
      await initPromise;
    };
    const withLockRaw = async <A>(tenantId: string, fn: () => Promise<A>): Promise<A> => {
      await ensure();
      if (initError) throw initError;
      if (!inner) {
        throw new LedgerLockError({ reason: "redis ledger lock failed to initialize" });
      }
      return inner.withLockRaw(tenantId, fn);
    };
    const lock: TenantLedgerLockApi = {
      backend: "redis",
      withLockRaw,
      withLock: lockEffectFromRaw(withLockRaw),
    };
    cached = { key, lock };
    return lock;
  }

  const pool = getPaymentsAuditPgPool(env);
  if (pool) {
    const lock = createPostgresTenantLedgerLock(pool, { waitMs: ledgerLockWaitMs(env) });
    cached = { key, lock };
    return lock;
  }

  const lock = createInProcessTenantLedgerLock();
  cached = { key, lock };
  return lock;
}

/** Test hook — replace process-wide lock and clear cache. */
export function setTenantLedgerLockForTests(lock: TenantLedgerLockApi | null): void {
  cached = lock ? { key: "test", lock } : null;
}

export function tenantLedgerLockLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<TenantLedgerLock> {
  return Layer.succeed(TenantLedgerLock, resolveTenantLedgerLock(env));
}

/** Promise façade for ledger.ts host boundary — preserves domain errors from `fn`. */
export async function withTenantLedgerLockPromise<A>(
  tenantId: string,
  fn: () => Promise<A>,
  env: NodeJS.ProcessEnv = process.env
): Promise<A> {
  return resolveTenantLedgerLock(env).withLockRaw(tenantId, fn);
}
