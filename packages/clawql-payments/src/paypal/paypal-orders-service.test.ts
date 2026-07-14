import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { PaypalOrdersService } from "./paypal-orders-service.js";

describe("PaypalOrdersService", () => {
  afterEach(() => {
    delete process.env.CLAWQL_PAYPAL_ENABLED;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_HOME;
    resetPaymentsEffectRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("creates and captures an order against mocked PayPal APIs", async () => {
    process.env.CLAWQL_HOME = "/tmp/clawql-paypal-test";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_PAYPAL_ENABLED = "1";
    process.env.PAYPAL_CLIENT_ID = "client";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    resetPaymentsEffectRuntimeForTests();

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/v1/oauth2/token")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (href.endsWith("/v2/checkout/orders") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "CREATED",
            links: [{ rel: "approve", href: "https://paypal.test/approve" }],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      if (href.includes("/capture")) {
        return new Response(
          JSON.stringify({
            id: "ORDER1",
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  captures: [{ amount: { currency_code: "USD", value: "10.00" } }],
                },
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Rebuild layer with custom fetch by calling service layer directly would be ideal;
    // live layer uses global fetch — stub above is sufficient.
    const created = await runPaymentsEffect(
      Effect.gen(function* () {
        const paypal = yield* PaypalOrdersService;
        return yield* paypal.createOrder({ amountUsd: 10, description: "test" });
      })
    );
    expect(created.id).toBe("ORDER1");
    expect(created.status).toBe("CREATED");

    const captured = await runPaymentsEffect(
      Effect.gen(function* () {
        const paypal = yield* PaypalOrdersService;
        return yield* paypal.captureOrder({ orderId: "ORDER1" });
      })
    );
    expect(captured.status).toBe("COMPLETED");
  });
});
