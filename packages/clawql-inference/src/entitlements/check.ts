import { runPaymentsEffect } from "clawql-payments/plugin";
import {
  assertInferenceEntitlementEffect,
  recordInferenceBillingEffect,
  recordInferenceUsageEffect,
  resolveInferenceTenantIdEffect,
  type AssertInferenceEntitlementInput,
  type InferenceTenantContext,
  type RecordInferenceBillingInput,
} from "./effect/entitlement-programs.js";

export { isInferenceEntitlementEnforcementActive } from "./flags.js";

export type {
  InferenceTenantContext,
  AssertInferenceEntitlementInput,
  RecordInferenceBillingInput,
};

export async function resolveInferenceTenantId(
  context: InferenceTenantContext = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  return runPaymentsEffect(resolveInferenceTenantIdEffect(context), env);
}

export async function assertInferenceEntitlement(
  input: AssertInferenceEntitlementInput & { env?: NodeJS.ProcessEnv }
): Promise<void> {
  const env = input.env ?? process.env;
  await runPaymentsEffect(
    assertInferenceEntitlementEffect({
      tenantId: input.tenantId,
      requested: input.requested,
      correlationId: input.correlationId,
    }),
    env
  );
}

export type RecordInferenceUsageInput = {
  tenantId: string;
  amount?: number;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
};

export async function recordInferenceUsage(input: RecordInferenceUsageInput): Promise<void> {
  const env = input.env ?? process.env;
  await runPaymentsEffect(recordInferenceUsageEffect({ ...input, env }), env);
}

export async function recordInferenceBilling(input: RecordInferenceUsageInput): Promise<void> {
  const env = input.env ?? process.env;
  await runPaymentsEffect(
    recordInferenceBillingEffect({
      tenantId: input.tenantId,
      amount: input.amount,
      correlationId: input.correlationId,
      env,
    }),
    env
  );
}
