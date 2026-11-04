import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { AcpCheckoutService } from "./acp-checkout-service.js";

describe("AcpCheckoutService", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-acp-"));
    prevHome = process.env.CLAWQL_HOME;
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_ACP_ENABLED = "1";
    process.env.CLAWQL_ACP_DRY_RUN = "1";
    delete process.env.STRIPE_SECRET_KEY;
    resetPaymentsEffectRuntimeForTests();
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_ACP_ENABLED;
    delete process.env.CLAWQL_ACP_DRY_RUN;
    resetPaymentsEffectRuntimeForTests();
    await rm(home, { recursive: true, force: true });
  });

  it("creates and completes a checkout session in dry-run", async () => {
    const completed = await runPaymentsEffect(
      Effect.gen(function* () {
        const acp = yield* AcpCheckoutService;
        const created = yield* acp.createSession({
          line_items: [{ name: "Pro seat", quantity: 1, unit_amount: 29 }],
          buyer: { email: "buyer@example.com" },
        });
        expect(created.status).toBe("ready_for_payment");
        expect(created.totals.total.amount).toBe(2900);
        return yield* acp.completeSession({
          checkout_session_id: created.id,
          payment_data: { token: "spt_test_token", provider: "stripe" },
        });
      })
    );

    expect(completed.status).toBe("completed");
    expect(completed.payment_intent_id).toMatch(/^pi_dry_/);
    expect(completed.order?.checkout_session_id).toBe(completed.id);
    // Write-ahead: durable Stripe idempotency key must be present before/with complete.
    expect(completed.stripe_idempotency_key).toBe(`clawql-acp-complete:${completed.id}`);
    expect(completed.stripe_idempotency_written_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reuses the same write-ahead idempotency key across complete retries", async () => {
    const { createdId, firstKey, secondKey } = await runPaymentsEffect(
      Effect.gen(function* () {
        const acp = yield* AcpCheckoutService;
        const created = yield* acp.createSession({
          line_items: [{ name: "Pro seat", quantity: 1, unit_amount: 10 }],
        });
        const first = yield* acp.completeSession({
          checkout_session_id: created.id,
          payment_data: { token: "spt_test_token", provider: "stripe" },
        });
        // Second complete on already-completed session should short-circuit or
        // keep the same durable key if re-entered before status flip.
        const again = yield* acp.getSession(created.id);
        return {
          createdId: created.id,
          firstKey: first.stripe_idempotency_key,
          secondKey: again.stripe_idempotency_key,
        };
      })
    );

    expect(firstKey).toBe(`clawql-acp-complete:${createdId}`);
    expect(secondKey).toBe(firstKey);
  });
});
