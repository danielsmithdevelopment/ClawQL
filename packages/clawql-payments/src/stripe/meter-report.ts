import { appendPaymentWormEntry, buildStripeMeterReportedEntry } from "../audit/index.js";
import { loadPaymentsConfig } from "../config/store.js";
import { isStripeConfigured } from "./client.js";
import { reportMeteredUsage } from "./metered.js";

export type StripeMeterConfig = {
  customerId: string;
  eventName: string;
};

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isStripeMeterReportingActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_REPORT_STRIPE_METER);
}

export async function resolveStripeMeterConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeMeterConfig | null> {
  if (!isStripeConfigured(env)) return null;

  const config = await loadPaymentsConfig(env);
  const customerId =
    config.stripe.customerId?.trim() || env.STRIPE_CUSTOMER_ID?.trim() || undefined;
  const eventName =
    config.stripe.meterEventName?.trim() || env.STRIPE_METER_EVENT_NAME?.trim() || undefined;

  if (!customerId || !eventName) return null;
  return { customerId, eventName };
}

export function buildInferenceMeterIdentifier(input: {
  tenantId: string;
  correlationId?: string;
}): string {
  if (input.correlationId?.trim()) {
    return `inference:${input.tenantId}:${input.correlationId.trim()}`;
  }
  return `inference:${input.tenantId}:${Date.now()}`;
}

export type ReportInferenceMeterUsageInput = {
  tenantId: string;
  value?: number;
  correlationId?: string;
  identifier?: string;
  env?: NodeJS.ProcessEnv;
};

export type ReportInferenceMeterUsageResult =
  | { reported: true; eventId: string; value: number }
  | { reported: false; reason: string };

export async function reportInferenceMeterUsageIfEnabled(
  input: ReportInferenceMeterUsageInput
): Promise<ReportInferenceMeterUsageResult> {
  const env = input.env ?? process.env;
  if (!isStripeMeterReportingActive(env)) {
    return { reported: false, reason: "stripe meter reporting is disabled" };
  }

  const meterConfig = await resolveStripeMeterConfig(env);
  if (!meterConfig) {
    return {
      reported: false,
      reason: "stripe customer id or meter event name is not configured",
    };
  }

  const value = input.value ?? 1;
  const identifier =
    input.identifier ??
    buildInferenceMeterIdentifier({
      tenantId: input.tenantId,
      correlationId: input.correlationId,
    });

  const result = await reportMeteredUsage({
    eventName: meterConfig.eventName,
    stripeCustomerId: meterConfig.customerId,
    value,
    identifier,
    env,
  });

  appendPaymentWormEntry(
    buildStripeMeterReportedEntry({
      tenantId: input.tenantId,
      value,
      eventName: meterConfig.eventName,
      stripeCustomerId: meterConfig.customerId,
      correlationId: input.correlationId,
    })
  );

  return { reported: true, eventId: result.id, value: result.value };
}
