import { loadPaymentsConfig } from "../config/store.js";
import { appendPaymentWormEntry } from "../audit/worm.js";
import { buildX402PaymentFailedEntry } from "../audit/events.js";
import { loadX402RuntimeConfig } from "./config.js";
import { findX402GateForResource } from "./gate.js";
import { parseX402PaymentPayloadHeader, readX402PaymentHeader } from "./headers.js";
import { verifyViaFacilitator } from "./facilitator.js";
import { buildPaymentRequiredForGate, buildPaymentRequirements } from "./requirements.js";
import { reconcileX402Settlement } from "./reconcile.js";
import type { X402PaymentRequired } from "./types.js";
import { usdcAtomicAmount } from "./config.js";

export type X402EnforceResult =
  | { action: "allow"; payer?: string; resource: string }
  | { action: "require_payment"; status: 402; body: X402PaymentRequired; resource: string }
  | { action: "deny"; status: 402; reason: string; resource: string };

export type EnforceX402GateInput = {
  resource: string;
  requestUrl: string;
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  settle?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

async function recordX402PaymentFailed(input: {
  tenantId: string;
  resource: string;
  reason: string;
  correlationId?: string;
  env: NodeJS.ProcessEnv;
}): Promise<void> {
  await appendPaymentWormEntry(
    buildX402PaymentFailedEntry({
      tenantId: input.tenantId,
      resource: input.resource,
      reason: input.reason,
      correlationId: input.correlationId,
    }),
    input.env
  );
}

export async function enforceX402Gate(input: EnforceX402GateInput): Promise<X402EnforceResult> {
  const env = input.env ?? process.env;
  const gate = await findX402GateForResource(input.resource, env);
  if (!gate) {
    return { action: "allow", resource: input.resource };
  }

  const paymentsConfig = await loadPaymentsConfig(env);
  const tenantId = paymentsConfig.tenantId ?? "default";

  const paymentHeader = readX402PaymentHeader(input.headers);
  if (!paymentHeader) {
    const body = await buildPaymentRequiredForGate({
      gate,
      requestUrl: input.requestUrl,
      env,
    });
    return {
      action: "require_payment",
      status: 402,
      body,
      resource: gate.resource,
    };
  }

  const paymentPayload = parseX402PaymentPayloadHeader(paymentHeader);
  if (!paymentPayload) {
    const reason = "invalid x402 payment payload in PAYMENT-SIGNATURE header";
    await recordX402PaymentFailed({
      tenantId,
      resource: gate.resource,
      reason,
      correlationId: input.correlationId,
      env,
    });
    return {
      action: "deny",
      status: 402,
      reason,
      resource: gate.resource,
    };
  }

  const config = await loadX402RuntimeConfig(env);
  if (!config.facilitatorUrl) {
    const reason = "x402 facilitator URL is not configured";
    await recordX402PaymentFailed({
      tenantId,
      resource: gate.resource,
      reason,
      correlationId: input.correlationId,
      env,
    });
    return {
      action: "deny",
      status: 402,
      reason,
      resource: gate.resource,
    };
  }

  const paymentRequirements = buildPaymentRequirements({
    gate,
    config,
    resourceUrl: input.requestUrl,
  });

  const verified = await verifyViaFacilitator({
    facilitatorUrl: config.facilitatorUrl,
    paymentPayload,
    paymentRequirements,
    env,
    fetchImpl: input.fetchImpl,
  });

  if (!verified.verified) {
    await recordX402PaymentFailed({
      tenantId,
      resource: gate.resource,
      reason: verified.reason,
      correlationId: input.correlationId,
      env,
    });
    return {
      action: "deny",
      status: 402,
      reason: verified.reason,
      resource: gate.resource,
    };
  }

  await reconcileX402Settlement({
    tenantId,
    resource: gate.resource,
    amountUsdc: gate.price,
    proof: {
      payer: verified.payer,
      amount: gate.price,
      asset: gate.asset,
      resource: gate.resource,
    },
    correlationId: input.correlationId,
  });

  return {
    action: "allow",
    payer: verified.payer,
    resource: gate.resource,
  };
}

export function resolveX402ResourceFromRequest(input: {
  path: string;
  toolHeader?: string;
}): string {
  if (input.toolHeader?.trim()) {
    return `tool:${input.toolHeader.trim()}`;
  }
  return input.path;
}

export function paymentRequiredHeaders(body: X402PaymentRequired): Record<string, string> {
  return {
    "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(body)).toString("base64"),
    "Content-Type": "application/json",
  };
}

export function formatAtomicUsdc(amount: string): number {
  return Number.parseInt(amount, 10) / 1_000_000;
}

export { usdcAtomicAmount };
