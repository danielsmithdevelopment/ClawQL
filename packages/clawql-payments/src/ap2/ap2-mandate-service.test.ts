import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { Ap2MandateService } from "./ap2-mandate-service.js";
import { signHs256Jwt } from "./jwt.js";
import { parsePaymentMandate, mandateCoversAmount } from "./parse.js";
import { VCT_PAYMENT_CLOSED } from "./types.js";

describe("AP2 parse/verify", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ap2-"));
    prevHome = process.env.CLAWQL_HOME;
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_AP2_ENABLED = "1";
    process.env.CLAWQL_AP2_HMAC_SECRET = "test-secret";
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_AP2_ENABLED;
    delete process.env.CLAWQL_AP2_HMAC_SECRET;
    resetPaymentsEffectRuntimeForTests();
    await rm(home, { recursive: true, force: true });
  });

  it("parses closed payment mandate JSON", () => {
    const { mandate } = parsePaymentMandate({
      vct: VCT_PAYMENT_CLOSED,
      transaction_id: "tx_1",
      payee: { id: "merchant_1", name: "ClawQL" },
      payment_amount: { currency: "USD", value: 199 },
      payment_instrument: { type: "card" },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(mandate.kind).toBe("payment");
    expect(mandate.payment_amount?.value).toBe(199);
    expect(mandateCoversAmount(mandate, 1.5, "USD")).toBe(true);
    expect(mandateCoversAmount(mandate, 2.5, "USD")).toBe(false);
  });

  it("verifies HS256-signed JWT mandate via Effect service", async () => {
    const token = signHs256Jwt(
      {
        vct: VCT_PAYMENT_CLOSED,
        transaction_id: "tx_jwt",
        payment_amount: { currency: "USD", value: 100 },
        payment_instrument: { type: "card" },
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      "test-secret"
    );

    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const ap2 = yield* Ap2MandateService;
        return yield* ap2.verifyPaymentMandate({
          raw: token,
          resource: "tool:search",
          tenantId: "t1",
        });
      })
    );

    expect(result.ok).toBe(true);
    expect(result.signed).toBe(true);
    expect(result.mandate.transaction_id).toBe("tx_jwt");
  });

  it("verifyFromHeaders returns present:false without header", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const ap2 = yield* Ap2MandateService;
        return yield* ap2.verifyFromHeaders({
          headers: {},
          resource: "tool:search",
        });
      })
    );
    expect(result.present).toBe(false);
  });
});
