import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildStripeInvoicePaidEntry } from "./events.js";
import { maybePushPaymentAuditEntryToLoki } from "./loki.js";

function mockResponse(ok: boolean, status = ok ? 204 : 500): Response {
  return {
    ok,
    status,
    text: async () => "",
  } as Response;
}

describe("payment audit Loki export", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pushes full payload to Loki when URL is configured", async () => {
    const fetchMock = vi.fn(async () => mockResponse(true));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const entry = buildStripeInvoicePaidEntry({
      tenantId: "acme",
      amountUsd: 12.34,
      correlationId: "corr-1",
    });

    maybePushPaymentAuditEntryToLoki(entry, {
      CLAWQL_LOKI_PUSH_URL: "https://loki.example/loki/api/v1/push",
      CLAWQL_LOKI_BEARER_TOKEN: "token-abc",
      CLAWQL_PAYMENTS_LOKI_JOB: "payments-test",
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
    expect(call).toBeDefined();
    expect(call![0]).toBe("https://loki.example/loki/api/v1/push");
    const init = call![1];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");

    const body = JSON.parse(String(init.body));
    expect(body.streams[0].stream).toEqual({ job: "payments-test", service: "clawql-payments" });
    const line = JSON.parse(body.streams[0].values[0][1]);
    expect(line.action).toBe("STRIPE_INVOICE_PAID");
    expect(line.payload.tenant_id).toBe("acme");
    expect(line.correlationId).toBe("corr-1");
  });

  it("no-ops when Loki URL is unset", async () => {
    const fetchMock = vi.fn(async () => mockResponse(true));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    maybePushPaymentAuditEntryToLoki(
      buildStripeInvoicePaidEntry({ tenantId: "t1", amountUsd: 1 }),
      {}
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
