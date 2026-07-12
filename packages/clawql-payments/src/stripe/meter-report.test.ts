import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import {
  buildInferenceMeterIdentifier,
  isStripeMeterReportingActive,
  reportInferenceMeterUsageIfEnabled,
  resolveStripeMeterConfig,
} from "./meter-report.js";

vi.mock("./metered.js", () => ({
  reportMeteredUsage: vi.fn(async () => ({ id: "meter_evt_test", value: 1 })),
}));

import { reportMeteredUsage } from "./metered.js";

describe("stripe meter reporting", () => {
  beforeEach(async () => {
    resetDefaultAuditRingBufferForTests();
    await resetPaymentAuditStoreForTests();
    vi.mocked(reportMeteredUsage).mockClear();
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
    expect(vi.mocked(reportMeteredUsage)).not.toHaveBeenCalled();
  });

  it("reportInferenceMeterUsageIfEnabled emits meter event and audit entry", async () => {
    const result = await reportInferenceMeterUsageIfEnabled({
      tenantId: "tenant-a",
      correlationId: "corr-99",
      env: {
        STRIPE_SECRET_KEY: "sk_test_xxx",
        STRIPE_CUSTOMER_ID: "cus_abc",
        STRIPE_METER_EVENT_NAME: "clawql_inference_calls",
        CLAWQL_PAYMENTS_REPORT_STRIPE_METER: "1",
      },
    });

    expect(result.reported).toBe(true);
    if (result.reported) {
      expect(result.eventId).toBe("meter_evt_test");
    }

    expect(vi.mocked(reportMeteredUsage)).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "clawql_inference_calls",
        stripeCustomerId: "cus_abc",
        value: 1,
        identifier: "inference:tenant-a:corr-99",
      })
    );

    const entries = await listPaymentAuditEntries(5);
    expect(entries.some((e) => e.action === "STRIPE_METER_REPORTED")).toBe(true);
  });
});
