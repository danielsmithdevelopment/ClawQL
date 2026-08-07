import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLive } from "clawql-core";
import { Effect, Layer } from "effect";
import { createX402Gate } from "../x402/gate.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import { MppVerificationService } from "./verification-service.js";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { x402RuntimeConfigLiveLayer } from "../x402/x402-runtime-config-service.js";
import { X402FacilitatorService } from "../x402/x402-facilitator-service.js";
import { stripeClientLiveLayer, StripeClientService } from "../stripe/stripe-client-service.js";
import { mppVerificationLiveLayer } from "./verification-service.js";
import { buildChallengesFromOffers } from "./challenge.js";
import { offersFromX402Required } from "./offers.js";
import { buildPaymentRequired } from "../x402/payment-requirements.js";
import { MPP_MCP_VERIFICATION_FAILED_CODE } from "./types.js";

describe("MppVerificationService", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-payments-mpp-verify-"));
    env = {
      ...process.env,
      CLAWQL_HOME: home,
      CLAWQL_X402_ENFORCE: "1",
      CLAWQL_MPP_ENABLED: "1",
    };
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
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    vi.restoreAllMocks();
    await rm(home, { recursive: true, force: true });
  });

  it("rejects unknown MPP challenge ids for stripe credentials", async () => {
    const { gate } = await createX402Gate({ resource: "/v1/test", price: 0.5, asset: "USDC" }, env);
    const credential = {
      challenge: {
        id: "missing-challenge",
        method: "stripe",
        intent: "charge",
        request: Buffer.from(JSON.stringify({ amount: "50", currency: "usd" }), "utf8").toString(
          "base64url"
        ),
      },
      payload: { token: "spt_test_123" },
    };
    const token = Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");

    const config = paymentsConfigLiveLayer(env);
    const audit = paymentAuditLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(env)))
    );
    const runtimeConfig = x402RuntimeConfigLiveLayer(env).pipe(Layer.provide(config));
    const facilitator = Layer.succeed(
      X402FacilitatorService,
      X402FacilitatorService.of({
        verify: () => Effect.succeed({ verified: true as const, settlementId: "settle_1" }),
        settle: () => Effect.succeed({ settled: true as const, transaction: "0xhash" }),
      })
    );
    const stripe = stripeClientLiveLayer({ ...env, STRIPE_SECRET_KEY: "sk_test_xxx" });
    const verification = mppVerificationLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(config, audit, runtimeConfig, facilitator, stripe))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* MppVerificationService;
        return yield* service
          .verifyCredential({
            resource: gate.resource,
            requestUrl: "https://example.com/v1/test",
            gate,
            headers: { authorization: `Payment ${token}` },
            env,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(verification))
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left).toMatchObject({
        _tag: "MppVerificationError",
        reason: "unknown or expired MPP challenge id",
        code: MPP_MCP_VERIFICATION_FAILED_CODE,
      });
    }
  });

  it("verifies legacy x402 PAYMENT-SIGNATURE credentials via facilitator", async () => {
    const { gate } = await createX402Gate(
      { resource: "/v1/legacy", price: 0.001, asset: "USDC" },
      env
    );
    const payload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0xasset",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      },
      payload: { signature: "0xabc" },
    };
    const header = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

    const verify = vi.fn(() =>
      Effect.succeed({ verified: true as const, settlementId: "settle_abc", payer: "0xpayer" })
    );

    const config = paymentsConfigLiveLayer(env);
    const audit = paymentAuditLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(env)))
    );
    const runtimeConfig = x402RuntimeConfigLiveLayer(env).pipe(Layer.provide(config));
    const facilitator = Layer.succeed(
      X402FacilitatorService,
      X402FacilitatorService.of({
        verify: verify,
        settle: () => Effect.succeed({ settled: true as const, transaction: "0xhash" }),
      })
    );
    const stripe = stripeClientLiveLayer(env);
    const verification = mppVerificationLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(config, audit, runtimeConfig, facilitator, stripe))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* MppVerificationService;
        return yield* service.verifyCredential({
          resource: gate.resource,
          requestUrl: "https://example.com/v1/legacy",
          gate,
          headers: { "payment-signature": header },
          env,
        });
      }).pipe(Effect.provide(verification))
    );

    expect(verify).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("x402");
    expect(result.payer).toBe("0xpayer");
    expect(result.receiptHeader).toBeTruthy();
  });

  it("registers challenges for later single-use verification", async () => {
    const { gate } = await createX402Gate(
      { resource: "/v1/register", price: 0.01, asset: "USDC" },
      env
    );
    const configLoaded = {
      walletAddress: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      scheme: "exact" as const,
      network: "eip155:84532",
      usdcAsset: "0xasset",
      facilitatorUrl: "https://x402.org/facilitator",
      maxTimeoutSeconds: 300,
    };
    const body = buildPaymentRequired({
      gate,
      config: configLoaded,
      resource: { url: "https://example.com/v1/register", mimeType: "application/json" },
    });
    const challenges = buildChallengesFromOffers({
      offers: offersFromX402Required(body, true),
      resource: gate.resource,
      x402Body: body,
    });

    const stripeChallenge = challenges.find((c) => c.method === "stripe");
    expect(stripeChallenge).toBeTruthy();

    const credential = {
      challenge: {
        id: stripeChallenge!.id,
        method: "stripe",
        intent: "charge",
        request: Buffer.from(JSON.stringify({ amount: "50", currency: "usd" }), "utf8").toString(
          "base64url"
        ),
      },
      payload: { token: "spt_test_registered" },
    };
    const token = Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");

    const create = vi.fn(async () => ({
      id: "pi_test",
      status: "succeeded",
    }));

    const config = paymentsConfigLiveLayer({ ...env, STRIPE_SECRET_KEY: "sk_test_xxx" });
    const audit = paymentAuditLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(env)))
    );
    const runtimeConfig = x402RuntimeConfigLiveLayer(env).pipe(Layer.provide(config));
    const facilitator = Layer.succeed(
      X402FacilitatorService,
      X402FacilitatorService.of({
        verify: () => Effect.succeed({ verified: true as const, settlementId: "settle_1" }),
        settle: () => Effect.succeed({ settled: true as const, transaction: "0xhash" }),
      })
    );
    const stripe = Layer.succeed(
      StripeClientService,
      StripeClientService.of({
        isConfigured: () => true,
        getClient: () =>
          Effect.succeed({
            paymentIntents: { create },
          } as unknown as import("stripe").default),
        getClientOptional: () =>
          ({
            paymentIntents: { create },
          }) as unknown as import("stripe").default,
      })
    );
    const verification = mppVerificationLiveLayer({
      ...env,
      STRIPE_SECRET_KEY: "sk_test_xxx",
    }).pipe(Layer.provide(Layer.mergeAll(config, audit, runtimeConfig, facilitator, stripe)));

    await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* MppVerificationService;
        yield* service.registerChallenges(challenges);
      }).pipe(Effect.provide(verification))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* MppVerificationService;
        return yield* service.verifyCredential({
          resource: gate.resource,
          requestUrl: "https://example.com/v1/register",
          gate,
          headers: { authorization: `Payment ${token}` },
          env: { ...env, STRIPE_SECRET_KEY: "sk_test_xxx" },
        });
      }).pipe(Effect.provide(verification))
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.method).toBe("stripe");
    expect(result.settlementId).toBe("pi_test");
  });
});
