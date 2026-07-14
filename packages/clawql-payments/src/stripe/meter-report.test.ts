import Stripe from "stripe";
import { Effect, Layer } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuditLive, resetDefaultAuditRingBufferForTests } from "clawql-core";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import { StripeClientService } from "./stripe-client-service.js";
import { StripeMeterService, stripeMeterLiveLayer } from "./stripe-meter-service.js";
import {
  buildInferenceMeterIdentifier,
  isStripeMeterReportingActive,
  reportInferenceMeterUsageIfEnabled,
  resolveStripeMeterConfig,
} from "./meter-report.js";

describe("stripe meter reporting", () => {
  beforeEach(async () => {
    resetDefaultAuditRingBufferForTests();
    await resetPaymentAuditStoreForTests();
    resetPaymentsEffectRuntimeForTests();
    vi.restoreAllMocks();
  });

  it("isStripeMeterReportingActive respects env flag", () => {
    expect(isStripeMeterReportingActive({ CLAWQL_PAYMENTS_REPORT_STRIPE_METER: "1" })).toBe(true);
    expect(isStripeMeterReportingActive({})).toBe(false);
  });

  it("buildInferenceMeterIdentifier uses correlation id when present", () => {
    expect(buildInferenceMeterIdentifier({ tenantId: "acme", correlationId: "corr-1" })).toBe(
      "inference:acme:corr-1"
    );
  });

  it("resolveStripeMeterConfig merges payments.json and env", async () => {
    const env = {
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_CUSTOMER_ID: "cus_env",
      STRIPE_METER_EVENT_NAME: "env_meter",
      CLAWQL_HOME: "/tmp/clawql-meter-test-empty",
    } as NodeJS.ProcessEnv;

    const config = await resolveStripeMeterConfig(env);
    expect(config).toEqual({ customerId: "cus_env", eventName: "env_meter" });
  });

  it("reportInferenceMeterUsageIfEnabled skips when disabled", async () => {
    const result = await reportInferenceMeterUsageIfEnabled({
      tenantId: "default",
      env: { STRIPE_SECRET_KEY: "sk_test" },
    });
    expect(result.reported).toBe(false);
  });

  it("reportInferenceMeterUsageIfEnabled emits meter event and audit entry", async () => {
    const meterCreate = vi.fn(async () => ({ identifier: "meter_evt_test" }));
    const env = {
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_CUSTOMER_ID: "cus_abc",
      STRIPE_METER_EVENT_NAME: "clawql_inference_calls",
      CLAWQL_PAYMENTS_REPORT_STRIPE_METER: "1",
      CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
    } as NodeJS.ProcessEnv;

    const stubStripe = {
      billing: { meterEvents: { create: meterCreate } },
    } as unknown as Stripe;

    const stubClientLayer = Layer.succeed(
      StripeClientService,
      StripeClientService.of({
        isConfigured: () => true,
        getClient: () => Effect.succeed(stubStripe),
        getClientOptional: () => stubStripe,
      })
    );

    const layer = stripeMeterLiveLayer(env).pipe(
      Layer.provide(
        Layer.mergeAll(
          stubClientLayer,
          paymentsConfigLiveLayer(env),
          paymentAuditLiveLayer(env).pipe(Layer.provide(AuditLive))
        )
      )
    );

    const program = Effect.gen(function* () {
      const meter = yield* StripeMeterService;
      return yield* meter.reportInferenceUsageIfEnabled({
        tenantId: "tenant-a",
        correlationId: "corr-99",
        env,
      });
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(result.reported).toBe(true);
    if (result.reported) {
      expect(result.eventId).toBe("meter_evt_test");
    }

    expect(meterCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "clawql_inference_calls",
        payload: expect.objectContaining({
          stripe_customer_id: "cus_abc",
          value: "1",
        }),
        identifier: "inference:tenant-a:corr-99",
      })
    );

    const entries = await listPaymentAuditEntries(5, env);
    expect(entries.some((e) => e.action === "STRIPE_METER_REPORTED")).toBe(true);
  });
});
