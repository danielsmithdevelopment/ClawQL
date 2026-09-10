import { describe, expect, it } from "vitest";
import { forwardCheckoutSessionToCpc } from "./cpc-provision-forward.js";
import type { GatewayEnv } from "./env.js";

describe("forwardCheckoutSessionToCpc", () => {
  it("no-ops when URL unset", async () => {
    const result = await forwardCheckoutSessionToCpc({} as GatewayEnv, { id: "cs" });
    expect(result).toEqual({ forwarded: false, reason: "CLAWQL_CPC_PROVISION_URL unset" });
  });

  it("POSTs session with bearer token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ orgId: "acme" }), { status: 201 });
    };
    const env = {
      CLAWQL_CPC_PROVISION_URL: "https://payments.example/payments/provision-org-from-checkout",
      CLAWQL_CPC_PROVISION_TOKEN: "secret",
    } as GatewayEnv;
    const result = await forwardCheckoutSessionToCpc(
      env,
      { id: "cs_1", metadata: { clawql_provision_org: "1" } },
      { correlationId: "corr", fetchImpl }
    );
    expect(result.forwarded).toBe(true);
    if (result.forwarded) {
      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("provision-org-from-checkout");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer secret",
    });
  });
});
