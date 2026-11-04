import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachAchTopupPaymentIntentId,
  ensureAchTopupIntent,
  loadAchTopupIntent,
} from "./ach-topup-intent-store.js";

describe("ach-topup-intent-store (Stripe write-ahead)", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ach-intent-"));
    prevHome = process.env.CLAWQL_HOME;
    process.env.CLAWQL_HOME = home;
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.CLAWQL_HOME;
    else process.env.CLAWQL_HOME = prevHome;
    await rm(home, { recursive: true, force: true });
  });

  it("persists idempotency key once and attaches PI after Stripe returns", async () => {
    const first = await ensureAchTopupIntent({
      durableId: "top_stable",
      tenantId: "t1",
      amountCents: 2500,
      customerId: "cus_1",
      idempotencyKey: "clawql-ach-topup:top_stable",
      createdAt: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-03T00:00:00.000Z",
    });
    const retry = await ensureAchTopupIntent({
      durableId: "top_stable",
      tenantId: "t1",
      amountCents: 2500,
      customerId: "cus_1",
      idempotencyKey: "clawql-ach-topup:OTHER",
      createdAt: "2026-11-03T01:00:00.000Z",
      updatedAt: "2026-11-03T01:00:00.000Z",
    });
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(retry.createdAt).toBe(first.createdAt);

    const withPi = await attachAchTopupPaymentIntentId("top_stable", "pi_abc");
    expect(withPi.paymentIntentId).toBe("pi_abc");
    expect((await loadAchTopupIntent("top_stable"))?.paymentIntentId).toBe("pi_abc");
  });
});
