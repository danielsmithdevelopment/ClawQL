import { describe, expect, it } from "vitest";
import {
  buildPaymentWormEntry,
  buildX402PaymentReceivedEntry,
} from "./events.js";

describe("payment audit events", () => {
  it("builds x402 payment received entry", () => {
    const entry = buildX402PaymentReceivedEntry({
      tenantId: "tenant-1",
      amountUsdc: 0.001,
      resource: "tool:knowledge_search",
      agentId: "agent-42",
      correlationId: "corr-1",
    });

    expect(entry.category).toBe("payment");
    expect(entry.action).toBe("X402_PAYMENT_RECEIVED");
    expect(entry.payload.provider).toBe("x402");
    expect(entry.correlationId).toBe("corr-1");
  });

  it("builds generic payment worm entry", () => {
    const entry = buildPaymentWormEntry({
      eventKind: "PLAN_UPGRADED",
      summary: "upgrade",
      payload: { provider: "stripe", tenant_id: "t1", plan: "pro" },
    });
    expect(entry.action).toBe("PLAN_UPGRADED");
  });
});
