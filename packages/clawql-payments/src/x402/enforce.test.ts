import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { createX402Gate } from "./gate.js";
import { enforceX402Gate } from "./enforce.js";
import { parseX402PaymentPayloadHeader } from "./headers.js";

describe("x402 gate enforcement", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-x402-enforce-"));
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
        },
        null,
        2
      )}\n`
    );
    resetDefaultAuditRingBufferForTests();
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("returns 402 payment required when gate exists and no proof is attached", async () => {
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.001, asset: "USDC" }, env);

    const result = await enforceX402Gate({
      resource: "/v1/chat/completions",
      requestUrl: "http://127.0.0.1:8080/v1/chat/completions",
      headers: {},
      env,
    });

    expect(result.action).toBe("require_payment");
    if (result.action === "require_payment") {
      expect(result.body.accepts[0]?.amount).toBe("1000");
    }
  });

  it("verifies payment via facilitator and allows request", async () => {
    await createX402Gate({ resource: "/v1/chat/completions", price: 0.001, asset: "USDC" }, env);

    const payload = {
      x402Version: 2,
      payload: { signature: "0xabc" },
    };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ isValid: true, payer: "0xpayer" }),
    }));

    const result = await enforceX402Gate({
      resource: "/v1/chat/completions",
      requestUrl: "http://127.0.0.1:8080/v1/chat/completions",
      headers: { "payment-signature": header },
      env,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.action).toBe("allow");
    if (result.action === "allow") {
      expect(result.payer).toBe("0xpayer");
    }
  });

  it("parses base64 payment payload headers", () => {
    const payload = { x402Version: 2, payload: { signature: "0x1" } };
    const header = Buffer.from(JSON.stringify(payload)).toString("base64");
    const parsed = parseX402PaymentPayloadHeader(header);
    expect(parsed?.x402Version).toBe(2);
  });
});
