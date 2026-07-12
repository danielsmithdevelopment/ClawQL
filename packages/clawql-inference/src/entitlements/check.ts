import {
  appendPaymentWormEntry,
  buildEntitlementLimitReachedEntry,
  checkEntitlementLimit,
  createUsageStore,
  entitlementsFromPlan,
  loadPaymentsConfig,
} from "clawql-payments";
import { EntitlementLimitError } from "./errors.js";

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isInferenceEntitlementEnforcementActive(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_ENFORCE_INFERENCE);
}

export type InferenceTenantContext = {
  team?: string;
  tenantId?: string;
};

export async function resolveInferenceTenantId(
  context: InferenceTenantContext = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (context.tenantId?.trim()) return context.tenantId.trim();
  if (context.team?.trim()) return context.team.trim();
  const config = await loadPaymentsConfig(env);
  return config.tenantId?.trim() || "default";
}

export type AssertInferenceEntitlementInput = {
  tenantId: string;
  requested?: number;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
};

export async function assertInferenceEntitlement(
  input: AssertInferenceEntitlementInput
): Promise<void> {
  const env = input.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const entitlements = entitlementsFromPlan(config.plan);
  const usage = await createUsageStore(env).getUsage(input.tenantId);
  const check = checkEntitlementLimit({
    entitlements,
    usage,
    resource: "inference_calls",
    requested: input.requested ?? 1,
  });

  if (!check.allowed) {
    appendPaymentWormEntry(
      buildEntitlementLimitReachedEntry({
        tenantId: input.tenantId,
        plan: config.plan,
        resource: "inference_calls",
        correlationId: input.correlationId,
      })
    );
    throw new EntitlementLimitError(check.reason);
  }
}

export type RecordInferenceUsageInput = {
  tenantId: string;
  amount?: number;
  env?: NodeJS.ProcessEnv;
};

export async function recordInferenceUsage(input: RecordInferenceUsageInput): Promise<void> {
  const env = input.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  await createUsageStore(env).increment(
    input.tenantId,
    "inference_calls",
    input.amount ?? 1,
    config.plan
  );
}
