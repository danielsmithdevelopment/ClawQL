import { createJsonlPaymentAuditStore } from "./jsonl-store.js";
import { MemoryPaymentAuditStore } from "./memory-store.js";
import {
  resolvePaymentAuditStoreMode,
  type PaymentAuditStore,
  type PaymentAuditStoreMode,
} from "./store.js";

let defaultStore: PaymentAuditStore | null = null;
let defaultStoreKey: string | null = null;

function storeKey(mode: PaymentAuditStoreMode, env: NodeJS.ProcessEnv): string {
  if (mode === "memory") return "memory";
  return `jsonl:${env.CLAWQL_HOME?.trim() || process.cwd()}`;
}

export function createPaymentAuditStore(env: NodeJS.ProcessEnv = process.env): PaymentAuditStore {
  const mode = resolvePaymentAuditStoreMode(env);
  if (mode === "memory") {
    return new MemoryPaymentAuditStore();
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

export function resetPaymentAuditStoreForTests(env: NodeJS.ProcessEnv = process.env): void {
  if (defaultStore) {
    defaultStore.reset();
  }
  defaultStore = null;
  defaultStoreKey = null;
  if (resolvePaymentAuditStoreMode(env) === "memory") {
    defaultStore = new MemoryPaymentAuditStore();
    defaultStoreKey = storeKey("memory", env);
  }
}
