/**
 * @module audit/factory
 * @internal
 *
 * Store selection/lifecycle helpers backing {@link PaymentAuditService}. These are
 * infrastructure façades (not a domain Effect surface); `PaymentAuditService` remains
 * the only public Effect API for payment audit.
 */
import { createJsonlPaymentAuditStore } from "./jsonl-store.js";
import { MemoryPaymentAuditStore } from "./memory-store.js";
import { createPostgresPaymentAuditStore } from "./postgres-store.js";
import { resolvePaymentsPoolConfig } from "./postgres-pool.js";
import {
  resolvePaymentAuditStoreMode,
  type PaymentAuditStore,
  type PaymentAuditStoreMode,
} from "./store.js";

let defaultStore: PaymentAuditStore | null = null;
let defaultStoreKey: string | null = null;

function storeKey(mode: PaymentAuditStoreMode, env: NodeJS.ProcessEnv): string {
  if (mode === "memory") return "memory";
  if (mode === "postgres") {
    const config = resolvePaymentsPoolConfig(env);
    return `postgres:${typeof config === "string" ? config : JSON.stringify(config)}`;
  }
  return `jsonl:${env.CLAWQL_HOME?.trim() || process.cwd()}`;
}

export function createPaymentAuditStore(env: NodeJS.ProcessEnv = process.env): PaymentAuditStore {
  const mode = resolvePaymentAuditStoreMode(env);
  if (mode === "memory") {
    return new MemoryPaymentAuditStore();
  }
  if (mode === "postgres") {
    const store = createPostgresPaymentAuditStore(env);
    if (!store) {
      throw new Error(
        "CLAWQL_PAYMENTS_AUDIT_STORE=postgres requires CLAWQL_PAYMENTS_DATABASE_URL " +
          "(or CLAWQL_INFERENCE_DATABASE_URL / CLAWQL_PAYMENTS_DB_* component vars)"
      );
    }
    return store;
  }
  return createJsonlPaymentAuditStore(env);
}

export function getPaymentAuditStore(env: NodeJS.ProcessEnv = process.env): PaymentAuditStore {
  const mode = resolvePaymentAuditStoreMode(env);
  const key = storeKey(mode, env);
  if (!defaultStore || defaultStoreKey !== key) {
    defaultStore = createPaymentAuditStore(env);
    defaultStoreKey = key;
  }
  return defaultStore;
}

export async function resetPaymentAuditStoreForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (defaultStore) {
    await defaultStore.reset();
  }
  defaultStore = null;
  defaultStoreKey = null;
  if (resolvePaymentAuditStoreMode(env) === "memory") {
    defaultStore = new MemoryPaymentAuditStore();
    defaultStoreKey = storeKey("memory", env);
  }
}
