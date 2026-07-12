import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createX402Gate } from "../x402/gate.js";
import { buildPaymentsWellKnownDocument } from "./well-known.js";

describe("buildPaymentsWellKnownDocument", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-payments-discovery-"));
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
    await rm(home, { recursive: true, force: true });
  });

  it("includes x402 resources from gates", async () => {
    await createX402Gate({ tool: "knowledge_search", price: 0.0005, asset: "USDC" }, env);
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.001, asset: "USDC" }, env);

    const doc = await buildPaymentsWellKnownDocument({ env, serverName: "Test" });
    const x402 = doc.payment_methods.find((m) => m.type === "x402");
    expect(x402?.type).toBe("x402");
    if (x402?.type === "x402") {
      expect(x402.resources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "mcp_tool", id: "knowledge_search" }),
          expect.objectContaining({ kind: "http", id: "/v1/chat/completions" }),
        ])
      );
      expect(x402.pay_to).toMatch(/^0x/);
      expect(doc.default).toBe("x402");
    }
  });

  it("includes stripe method when secret key is configured", async () => {
    const doc = await buildPaymentsWellKnownDocument({
      env: { ...env, STRIPE_SECRET_KEY: "sk_test_xxx" },
    });
    const stripe = doc.payment_methods.find((m) => m.type === "stripe");
    expect(stripe?.type).toBe("stripe");
    if (stripe?.type === "stripe") {
      expect(stripe.plans).toContain("pro");
      expect(stripe.meter_event_name).toBe("clawql_inference_calls");
    }
  });
});
