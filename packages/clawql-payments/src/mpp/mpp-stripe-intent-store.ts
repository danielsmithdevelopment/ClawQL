/**
 * Write-ahead store for MPP Stripe SPT PaymentIntent idempotency keys.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolvePaymentsDir } from "../config/paths.js";

export type MppStripeIntent = {
  readonly durableId: string;
  readonly tenantId: string;
  readonly resource: string;
  readonly amount: number;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly paymentIntentId?: string;
};

type IntentStore = Record<string, MppStripeIntent>;

function intentsPath(env: NodeJS.ProcessEnv): string {
  return join(resolvePaymentsDir(env), "mpp-stripe-intents.json");
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

export async function ensureMppStripeIntent(
  intent: MppStripeIntent,
  env: NodeJS.ProcessEnv = process.env
): Promise<MppStripeIntent> {
  const store = await loadStore(env);
  const existing = store[intent.durableId];
  if (existing) return existing;
  store[intent.durableId] = intent;
  await saveStore(env, store);
  return intent;
}

export async function attachMppStripePaymentIntentId(
  durableId: string,
  paymentIntentId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<MppStripeIntent> {
  const store = await loadStore(env);
  const existing = store[durableId.trim()];
  if (!existing) {
    throw new Error(`Unknown MPP Stripe intent: ${durableId}`);
  }
  const next: MppStripeIntent = {
    ...existing,
    paymentIntentId: paymentIntentId.trim(),
    updatedAt: new Date().toISOString(),
  };
  store[durableId.trim()] = next;
  await saveStore(env, store);
  return next;
}
