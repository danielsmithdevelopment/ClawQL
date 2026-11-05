/**
 * Write-ahead store for ACH top-up Stripe idempotency keys.
 * Persist key before paymentIntents.create; attach PI id after.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type AchTopupIntent = {
  readonly durableId: string;
  readonly tenantId: string;
  readonly amountCents: number;
  readonly customerId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly paymentIntentId?: string;
};

type IntentStore = Record<string, AchTopupIntent>;

function intentsPath(env: NodeJS.ProcessEnv): string {
  return join(resolvePaymentsDir(env), "ach-topup-intents.json");
}

async function loadStore(env: NodeJS.ProcessEnv): Promise<IntentStore> {
  try {
    const raw = await readFile(intentsPath(env), "utf8");
    const parsed = JSON.parse(raw) as IntentStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveStore(env: NodeJS.ProcessEnv, store: IntentStore): Promise<void> {
  const path = intentsPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function loadAchTopupIntent(
  durableId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<AchTopupIntent | null> {
  const store = await loadStore(env);
  return store[durableId.trim()] ?? null;
}

export async function ensureAchTopupIntent(
  intent: AchTopupIntent,
  env: NodeJS.ProcessEnv = process.env
): Promise<AchTopupIntent> {
  const store = await loadStore(env);
  const existing = store[intent.durableId];
  if (existing) return existing;
  store[intent.durableId] = intent;
  await saveStore(env, store);
  return intent;
}

export async function attachAchTopupPaymentIntentId(
  durableId: string,
  paymentIntentId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<AchTopupIntent> {
  const store = await loadStore(env);
  const existing = store[durableId.trim()];
  if (!existing) {
    throw new Error(`Unknown ACH top-up intent: ${durableId}`);
  }
  const next: AchTopupIntent = {
    ...existing,
    paymentIntentId: paymentIntentId.trim(),
    updatedAt: new Date().toISOString(),
  };
  store[durableId.trim()] = next;
  await saveStore(env, store);
  return next;
}
