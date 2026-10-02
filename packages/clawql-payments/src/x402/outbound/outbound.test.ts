/**
 * Outbound x402 payer — deny-by-default, allowlist, caps, HITL, digest, freeze.
 */

import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";
import { computeQuoteDigest } from "./quote.js";
import { createMemoryOutboundSpendCounterLayer } from "./counters.js";
import {
  createMemoryOutboundPolicyStoreLayer,
  OutboundPolicyStoreService,
} from "./policy-store.js";
import { createX402SignerLayer, X402SignerService } from "./signer-service.js";
import { runOutboundX402PayBatchEffect } from "./pay-batch.js";
import type { OutboundX402QuoteTerms } from "./types.js";

const policyDoc = {
  hostsAllowlist: ["api.example.com"],
  payToAllowlist: ["0xpayee"],
  networksAllowlist: ["eip155:8453"],
  assetsAllowlist: ["0xusdc"],
  maxUsdcPerCall: "0.05",
  maxUsdcPerDay: "1",
  maxUsdcPerSession: "0.5",
  humanApprovalAboveUsdc: "0.01",
  requireDocumentedJustification: true as const,
  documentedJustificationId: "ticket-outbound-1",
};

const terms: OutboundX402QuoteTerms = {
  scheme: "exact",
  network: "eip155:8453",
  amountAtomic: "5000", // 0.005 USDC
  asset: "0xUsdc",
  payTo: "0xPayee",
};

function paymentRequiredBody(t: OutboundX402QuoteTerms = terms): string {
  return JSON.stringify({
    x402Version: 2,
    accepts: [
      {
        scheme: t.scheme,
        network: t.network,
        amount: t.amountAtomic,
        asset: t.asset,
        payTo: t.payTo,
      },
    ],
  });
}

function makeRuntime() {
  const layer = Layer.mergeAll(
    createMemoryOutboundPolicyStoreLayer(),
    createMemoryOutboundSpendCounterLayer(),
    createX402SignerLayer({
      mode: "dry-run",
      dryRunPayerAddress: "0xDryRunPayer",
    })
  );
  return ManagedRuntime.make(layer);
}

async function withSeededTenant(
  runtime: ManagedRuntime.ManagedRuntime<
    | OutboundPolicyStoreService
    | import("./counters.js").OutboundSpendCounterService
    | X402SignerService,
    never
  >,
  tenantId: string,
  opts?: { markEnabled?: boolean }
) {
  await runtime.runPromise(
    Effect.gen(function* () {
      const store = yield* OutboundPolicyStoreService;
      const accepted = yield* store.acceptPolicy(tenantId, policyDoc);
      if (opts?.markEnabled) {
        yield* store.markOutboundEnabled(tenantId, accepted.versionId);
      }
    })
  );
}

describe("outbound-x402-pay batch", () => {
  it("denies when CLAWQL_PAYMENTS_OUTBOUND is off", async () => {
    const runtime = makeRuntime();
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t1",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: {},
        fetchImpl: async () => new Response("nope", { status: 500 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("outbound_disabled");
    await runtime.dispose();
  });

  it("denies when policy is missing", async () => {
    const runtime = makeRuntime();
    let calls = 0;
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "no-policy",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        fetchImpl: async () => {
          calls += 1;
          return new Response(paymentRequiredBody(), { status: 402 });
        },
      })
    );
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("policy_missing");
      expect(result.batch.payment?.hookDecision).toBe("deny");
    }
    await runtime.dispose();
  });

  it("denies host allowlist miss", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-host");

    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-host",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://evil.example/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        fetchImpl: async () => new Response(paymentRequiredBody(), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("policy_denied");
      expect(result.detail).toBe("host_not_allowlisted");
    }
    await runtime.dispose();
  });

  it("denies payTo allowlist miss", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-payto");

    const badTerms = { ...terms, payTo: "0xOther" };
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-payto",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        fetchImpl: async () => new Response(paymentRequiredBody(badTerms), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toBe("payTo_not_allowlisted");
    await runtime.dispose();
  });

  it("denies per-call cap breach", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-cap");

    const expensive = { ...terms, amountAtomic: "100000" }; // 0.1 USDC > 0.05
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-cap",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: {
          quoteDigest: computeQuoteDigest(expensive),
          approvedAt: new Date().toISOString(),
        },
        fetchImpl: async () => new Response(paymentRequiredBody(expensive), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toBe("max_usdc_per_call_exceeded");
    await runtime.dispose();
  });

  it("requires HITL on first enablement (no override)", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-hitl");

    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-hitl",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        fetchImpl: async () => new Response(paymentRequiredBody(), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("hitl_required");
      expect(result.batch.payment?.hookDecision).toBe("hitl");
    }
    await runtime.dispose();
  });

  it("rejects HITL bound to a different quote digest", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-digest", { markEnabled: true });

    const high = { ...terms, amountAtomic: "20000" }; // 0.02 >= 0.01 HITL
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-digest",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: {
          quoteDigest: "wrong-digest",
          approvedAt: new Date().toISOString(),
        },
        fetchImpl: async () => new Response(paymentRequiredBody(high), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toBe("hitl_quote_digest_mismatch");
    await runtime.dispose();
  });

  it("rejects expectedQuoteDigest mismatch", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-q");

    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-q",
        agentId: "a1",
        sessionId: "s1",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        expectedQuoteDigest: "not-the-digest",
        fetchImpl: async () => new Response(paymentRequiredBody(), { status: 402 }),
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quote_mismatch");
    await runtime.dispose();
  });

  it("freezes signer after settle_unconfirmed and blocks retry-sign", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-freeze");

    const digest = computeQuoteDigest(terms);
    let phase = 0;
    const fetchImpl: typeof fetch = async () => {
      phase += 1;
      if (phase === 1) {
        return new Response(paymentRequiredBody(), { status: 402 });
      }
      throw new Error("network down after sign");
    };

    const first = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-freeze",
        agentId: "a1",
        sessionId: "s-freeze",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
        fetchImpl,
      })
    );
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.reason).toBe("settle_unconfirmed");

    const frozen = await runtime.runPromise(
      Effect.gen(function* () {
        const signer = yield* X402SignerService;
        return yield* signer.isFrozen("s-freeze", "t-freeze", "a1");
      })
    );
    expect(frozen).toBe(true);

    phase = 0;
    const second = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-freeze",
        agentId: "a1",
        sessionId: "s-freeze",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
        fetchImpl: async () => new Response(paymentRequiredBody(), { status: 402 }),
      })
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("signer_frozen");
    await runtime.dispose();
  });

  it("happy path with HITL first enablement + dry-run signer", async () => {
    const runtime = makeRuntime();
    await withSeededTenant(runtime, "t-ok");

    const digest = computeQuoteDigest(terms);
    let calls = 0;
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "t-ok",
        agentId: "a1",
        sessionId: "s-ok",
        resourceUrl: "https://api.example.com/r",
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
        fetchImpl: async (_url, init) => {
          calls += 1;
          if (calls === 1) {
            return new Response(paymentRequiredBody(), { status: 402 });
          }
          const headers = init?.headers as Record<string, string> | undefined;
          expect(headers?.["PAYMENT-SIGNATURE"] || headers?.["X-PAYMENT"]).toBeTruthy();
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.batch.payment?.kind).toBe("outbound_payment");
      expect(result.batch.payment?.quoteDigest).toBe(digest);
      expect(result.batch.payment?.hookDecision).toBe("allow");
      expect(result.batch.innerCallCount).toBe(2);
    }
    await runtime.dispose();
  });
});
