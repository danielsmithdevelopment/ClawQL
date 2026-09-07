/**
 * Spec-faithful local x402 fixture (public-shape PAYMENT-REQUIRED) e2e for outbound payer.
 * Happy path + deny (host allowlist). Uses dry-run signer — no chain funds required.
 */

import { createServer, type Server } from "node:http";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeQuoteDigest } from "./quote.js";
import { createMemoryOutboundSpendCounterLayer } from "./counters.js";
import {
  createMemoryOutboundPolicyStoreLayer,
  OutboundPolicyStoreService,
} from "./policy-store.js";
import { createX402SignerLayer } from "./signer-service.js";
import { runOutboundX402PayBatchEffect } from "./pay-batch.js";
import type { OutboundX402QuoteTerms } from "./types.js";
import {
  createOutboundX402PayBatchScript,
  OUTBOUND_X402_PAY_BATCH_NAME,
} from "./batch-script.js";
import {
  createMemoryExecuteBatchRegistryLayer,
  ExecuteBatchRegistry,
  runNamedExecuteBatch,
  WormAuditSink,
} from "clawql-core";

const PAYEE = "0x0000000000000000000000000000000000000EaD";
const ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NETWORK = "eip155:84532";

const terms: OutboundX402QuoteTerms = {
  scheme: "exact",
  network: NETWORK,
  amountAtomic: "1000",
  asset: ASSET,
  payTo: PAYEE,
  maxTimeoutSeconds: 300,
  extra: { name: "USDC", version: "2" },
};

const policyDoc = {
  hostsAllowlist: ["127.0.0.1", "localhost"],
  payToAllowlist: [PAYEE],
  networksAllowlist: [NETWORK],
  assetsAllowlist: [ASSET],
  maxUsdcPerCall: "0.05",
  maxUsdcPerDay: "1",
  maxUsdcPerSession: "0.5",
  humanApprovalAboveUsdc: "0.01",
  requireDocumentedJustification: true as const,
  documentedJustificationId: "fixture-e2e-1",
};

function paymentRequiredJson(resourceUrl: string) {
  return {
    x402Version: 2,
    error: "Payment required",
    resource: { url: resourceUrl, mimeType: "application/json" },
    accepts: [
      {
        scheme: terms.scheme,
        network: terms.network,
        amount: terms.amountAtomic,
        asset: terms.asset,
        payTo: terms.payTo,
        maxTimeoutSeconds: terms.maxTimeoutSeconds,
        extra: terms.extra,
      },
    ],
  };
}

describe("outbound x402 fixture e2e", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = `http://127.0.0.1${req.url ?? "/"}`;
      const paid =
        Boolean(req.headers["payment-signature"]) || Boolean(req.headers["x-payment"]);
      if (!paid) {
        const body = paymentRequiredJson(url);
        const encoded = Buffer.from(JSON.stringify(body)).toString("base64");
        res.writeHead(402, {
          "content-type": "application/json",
          "PAYMENT-REQUIRED": encoded,
        });
        res.end(JSON.stringify(body));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: "paid-ok", fixture: true }));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no listen address");
    baseUrl = `http://127.0.0.1:${addr.port}/resource`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function makeRuntime() {
    const layer = Layer.mergeAll(
      createMemoryOutboundPolicyStoreLayer(),
      createMemoryOutboundSpendCounterLayer(),
      createX402SignerLayer({ mode: "dry-run" })
    );
    return ManagedRuntime.make(layer);
  }

  it("happy path: 402 → HITL → pay → 200 against local public-shape fixture", async () => {
    const runtime = makeRuntime();
    await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* OutboundPolicyStoreService;
        yield* store.acceptPolicy("fixture-tenant", policyDoc);
      })
    );

    const digest = computeQuoteDigest(terms);
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "fixture-tenant",
        agentId: "agent-1",
        sessionId: "sess-1",
        resourceUrl: baseUrl,
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.body).toContain("paid-ok");
      expect(result.batch.payment?.hookDecision).toBe("allow");
      expect(result.batch.batchName).toBe("outbound-x402-pay");
    }
    await runtime.dispose();
  });

  it("deny path: host not allowlisted", async () => {
    const runtime = makeRuntime();
    await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* OutboundPolicyStoreService;
        yield* store.acceptPolicy("fixture-deny", {
          ...policyDoc,
          hostsAllowlist: ["only.example.com"],
        });
      })
    );

    const digest = computeQuoteDigest(terms);
    const result = await runtime.runPromise(
      runOutboundX402PayBatchEffect({
        tenantId: "fixture-deny",
        agentId: "agent-1",
        sessionId: "sess-deny",
        resourceUrl: baseUrl,
        env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
        hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("policy_denied");
      expect(result.detail).toBe("host_not_allowlisted");
      expect(result.batch.payment?.hookDecision).toBe("deny");
    }
    await runtime.dispose();
  });

  it("named execute-batch runner wires outbound-x402-pay + WORM", async () => {
    const { loadOutboundPaymentPolicy } = await import("clawql-core");
    const accepted = await Effect.runPromise(loadOutboundPaymentPolicy(policyDoc));
    const seed = new Map([["batch-tenant", accepted]]);

    const paymentsLayer = Layer.mergeAll(
      createMemoryOutboundPolicyStoreLayer(seed),
      createMemoryOutboundSpendCounterLayer(),
      createX402SignerLayer({ mode: "dry-run" })
    );
    const wormEvents: unknown[] = [];
    const wormLayer = Layer.succeed(
      WormAuditSink,
      WormAuditSink.of({
        append: (e) =>
          Effect.sync(() => {
            wormEvents.push(e);
          }),
      })
    );

    const script = createOutboundX402PayBatchScript({
      env: { CLAWQL_PAYMENTS_OUTBOUND: "1" },
      provideLayer: paymentsLayer,
    });

    const registryLayer = createMemoryExecuteBatchRegistryLayer([script]);
    const runtime = ManagedRuntime.make(Layer.mergeAll(registryLayer, wormLayer));

    const listed = await runtime.runPromise(
      Effect.gen(function* () {
        const reg = yield* ExecuteBatchRegistry;
        return yield* reg.list();
      })
    );
    expect(listed).toContain(OUTBOUND_X402_PAY_BATCH_NAME);

    const digest = computeQuoteDigest(terms);
    const result = await runtime.runPromise(
      runNamedExecuteBatch({
        batchName: OUTBOUND_X402_PAY_BATCH_NAME,
        args: {
          tenantId: "batch-tenant",
          agentId: "a1",
          sessionId: "s1",
          payload: {
            resourceUrl: baseUrl,
            hitlApproval: { quoteDigest: digest, approvedAt: new Date().toISOString() },
          },
        },
      })
    );

    expect(result.batch.success).toBe(true);
    expect(wormEvents.map((e) => (e as { type: string }).type)).toEqual([
      "EXECUTE_BATCH_STARTED",
      "EXECUTE_BATCH_COMPLETED",
    ]);
    await runtime.dispose();
  });
});
