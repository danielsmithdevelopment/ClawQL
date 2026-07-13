import { Context, Effect, Layer } from "effect";
import { PaymentsConfigService } from "../config/payments-config-service.js";
import { buildStripeMeterReportedEntry } from "../audit/events.js";
import type { ConfigError } from "../errors/payment-errors.js";
import type { PaymentError } from "../errors/payment-errors.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { StripeApiError, StripeNotConfigured } from "./stripe-errors.js";
import { StripeClientService, isStripeConfigured, stripeTryPromise } from "./stripe-client-service.js";

export type StripeMeterConfig = {
  customerId: string;
  eventName: string;
};

export type MeteredUsageInput = {
  eventName: string;
  stripeCustomerId: string;
  value: number;
  identifier?: string;
  timestamp?: number;
  env?: NodeJS.ProcessEnv;
};

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

function parseTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isStripeMeterReportingActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseTruthy(env.CLAWQL_PAYMENTS_REPORT_STRIPE_METER);
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

/** Effect service for Stripe meter events and inference usage reporting. */
export class StripeMeterService extends Context.Tag("clawql/StripeMeterService")<
  StripeMeterService,
  {
    readonly resolveMeterConfig: (
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<StripeMeterConfig | null, ConfigError>;
    readonly reportMeteredUsage: (
      input: MeteredUsageInput
    ) => Effect.Effect<{ id: string; value: number }, StripeApiError | StripeNotConfigured>;
    readonly reportInferenceUsageIfEnabled: (
      input: ReportInferenceMeterUsageInput
    ) => Effect.Effect<
      ReportInferenceMeterUsageResult,
      ConfigError | PaymentError | StripeApiError | StripeNotConfigured
    >;
  }
>() {}

export function stripeMeterLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<
  StripeMeterService,
  never,
  StripeClientService | PaymentsConfigService | PaymentAuditService
> {
  return Layer.effect(
    StripeMeterService,
    Effect.gen(function* () {
      const stripeClient = yield* StripeClientService;
      const configService = yield* PaymentsConfigService;
      const audit = yield* PaymentAuditService;

      const resolveMeterConfig = (runEnv: NodeJS.ProcessEnv = env) =>
        Effect.gen(function* () {
          if (!isStripeConfigured(runEnv)) return null;
          const config = yield* configService.load();
          const customerId =
            config.stripe.customerId?.trim() || runEnv.STRIPE_CUSTOMER_ID?.trim() || undefined;
          const eventName =
            config.stripe.meterEventName?.trim() ||
            runEnv.STRIPE_METER_EVENT_NAME?.trim() ||
            undefined;
          if (!customerId || !eventName) return null;
          return { customerId, eventName };
        });

      const reportMeteredUsage = (input: MeteredUsageInput) =>
        Effect.gen(function* () {
          const client = yield* stripeClient.getClient();
          const event = yield* stripeTryPromise("stripe meter event create failed", () =>
            client.billing.meterEvents.create({
              event_name: input.eventName,
              payload: {
                stripe_customer_id: input.stripeCustomerId,
                value: String(input.value),
              },
              identifier: input.identifier,
              timestamp: input.timestamp,
            })
          );
          return { id: event.identifier, value: input.value };
        });

      const reportInferenceUsageIfEnabled = (input: ReportInferenceMeterUsageInput) =>
        Effect.gen(function* () {
          const runEnv = input.env ?? env;
          if (!isStripeMeterReportingActive(runEnv)) {
            return { reported: false as const, reason: "stripe meter reporting is disabled" };
          }

          const meterConfig = yield* resolveMeterConfig(runEnv);
          if (!meterConfig) {
            return {
              reported: false as const,
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

          const result = yield* reportMeteredUsage({
            eventName: meterConfig.eventName,
            stripeCustomerId: meterConfig.customerId,
            value,
            identifier,
            env: runEnv,
          });

          yield* audit.appendEntry(
            buildStripeMeterReportedEntry({
              tenantId: input.tenantId,
              value,
              eventName: meterConfig.eventName,
              stripeCustomerId: meterConfig.customerId,
              correlationId: input.correlationId,
            })
          );

          return { reported: true as const, eventId: result.id, value: result.value };
        });

      return StripeMeterService.of({
        resolveMeterConfig,
        reportMeteredUsage,
        reportInferenceUsageIfEnabled,
      });
    })
  );
}
