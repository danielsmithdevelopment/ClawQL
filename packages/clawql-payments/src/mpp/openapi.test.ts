import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createX402Gate } from "../x402/gate.js";
import { buildMppOpenApiDocument } from "./openapi.js";
import { offersFromX402Required, buildOffersForGate } from "./offers.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";

describe("buildMppOpenApiDocument", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-payments-mpp-"));
    env = { ...process.env, CLAWQL_HOME: home };
    await mkdir(join(home, "Payments"), { recursive: true });
    await writeFile(
      join(home, "Payments", "payments.json"),
      `${JSON.stringify(
        {
          tenantId: "tenant-a",
          plan: "pro",
          x402: {
            walletAddress: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            facilitatorUrl: "https://x402.org/facilitator",
          },
          stripe: { meterEventName: "clawql_inference_calls" },
        },
        null,
        2
      )}\n`
    );
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    await rm(home, { recursive: true, force: true });
  });

  it("emits canonical x-payment-info.offers[] for gated routes", async () => {
    await createX402Gate(
      { resource: "/v1/chat/completions", price: 0.001, asset: "USDC" },
      env
    );

    const doc = await buildMppOpenApiDocument({
      env: { ...env, STRIPE_SECRET_KEY: "sk_test_xxx" },
      origin: "https://inference.example.com",
      serverName: "Test Inference",
    });

    const op = (doc.paths as Record<string, Record<string, unknown>>)[
      "/v1/chat/completions"
    ]?.post as Record<string, unknown>;
    const paymentInfo = op["x-payment-info"] as { offers: Array<Record<string, unknown>> };
    expect(paymentInfo.offers.length).toBeGreaterThanOrEqual(2);
    expect(paymentInfo.offers[0]).toMatchObject({
      intent: "charge",
      method: "x402",
      amount: "1000",
    });
    expect(paymentInfo.offers.some((o) => o.method === "stripe")).toBe(true);
    expect((op.responses as Record<string, unknown>)["402"]).toBeTruthy();
    expect(doc["x-service-info"]).toBeTruthy();
  });
});

describe("offersFromX402Required", () => {
  it("maps x402 accepts to MPP offers and adds stripe when enabled", () => {
    const offers = offersFromX402Required(
      {
        x402Version: 2,
        resource: { url: "https://example.com/v1", mimeType: "application/json" },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:84532",
            amount: "500",
            asset: "0xabc",
            payTo: "0xpay",
          },
        ],
      },
      true
    );
    expect(offers[0]).toMatchObject({ method: "x402", amount: "500" });
    expect(offers[1]).toMatchObject({ method: "stripe", amount: null });
  });
});

describe("buildOffersForGate", () => {
  it("includes both rails when configured", () => {
    const gate = {
      id: "g1",
      resource: "/v1/test",
      price: 0.002,
      asset: "USDC" as const,
      createdAt: new Date().toISOString(),
    };
    const offers = buildOffersForGate({
      gate,
      config: {
        network: "eip155:84532",
        scheme: "exact",
        usdcAsset: "0xasset",
        walletAddress: "0xwallet",
        maxTimeoutSeconds: 300,
      },
      stripeEnabled: true,
      stripeMetered: true,
    });
    expect(offers.map((o) => o.method)).toEqual(["x402", "stripe"]);
  });
});
