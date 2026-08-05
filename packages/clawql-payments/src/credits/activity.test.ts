import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLive } from "clawql-core";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import {
  appendCreditEntry,
  creditsLedgerLiveLayer,
  resetCreditsLedgerForTests,
} from "./ledger.js";
import { claimDirectory, resetDirectoryForTests } from "./directory.js";
import { creditsStepUpLiveLayer } from "./step-up.js";
import { pendingActionsLiveLayer } from "../compensation/pending-actions.js";
import { CreditsService, creditsLiveLayer } from "./credits-service.js";
import { acceptMoneyRequest, createMoneyRequest, resetMoneyRequestsForTests } from "./requests.js";
import { formatActivityLine, getActivityFeed } from "./activity.js";

describe("credits activity feed", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-act-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_CREDITS_P2P_ENABLED = "1";
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    delete process.env.CLAWQL_CREDITS_TRANSFER_REQUIRE_TOTP;
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(process.env);
    await resetCreditsLedgerForTests(process.env);
    await resetDirectoryForTests(process.env);
    await resetMoneyRequestsForTests(process.env);
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    await rm(home, { recursive: true, force: true });
  });

  const layer = () => {
    const audit = paymentAuditLiveLayer(process.env).pipe(Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(process.env))));
    const ledger = creditsLedgerLiveLayer(process.env);
    const stepUp = creditsStepUpLiveLayer(process.env);
    const pending = pendingActionsLiveLayer(process.env);
    return creditsLiveLayer(process.env).pipe(
      Layer.provide(Layer.mergeAll(audit, ledger, stepUp, pending))
    );
  };

  it("merges transfers and open requests with directory labels", async () => {
    await claimDirectory({
      email: "alice@acme.com",
      tenantId: "alice",
      handle: "alice",
    });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });
    await appendCreditEntry({
      tenantId: "alice",
      kind: "topup_settled",
      deltaCents: 10_000,
      grantSource: "topup",
      note: "seed",
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.transfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 2000,
          note: "coffee",
        });
      }).pipe(Effect.provide(layer()))
    );

    const { request } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "bob@acme.com",
      amountCents: 1500,
      note: "lunch",
    });

    const feed = await getActivityFeed({ tenantId: "alice", limit: 20, filter: "money" });
    expect(feed.label).toBe("@alice");
    expect(feed.balanceCents).toBe(8000);

    const kinds = feed.items.map((i) => i.kind);
    expect(kinds).toContain("transfer_sent");
    expect(kinds).toContain("request_out");

    const sent = feed.items.find((i) => i.kind === "transfer_sent");
    expect(sent?.counterpartyLabel).toBe("@bob");
    expect(sent?.amountCents).toBe(-2000);

    const req = feed.items.find((i) => i.requestId === request.requestId);
    expect(req?.kind).toBe("request_out");
    expect(req?.requestStatus).toBe("pending");
    expect(formatActivityLine(sent!)).toMatch(/sent/);
  });

  it("dedupes paid requests once ledger transfer exists", async () => {
    await claimDirectory({ email: "a@x.com", tenantId: "a" });
    await claimDirectory({ email: "b@x.com", tenantId: "b" });
    await appendCreditEntry({
      tenantId: "b",
      kind: "topup_settled",
      deltaCents: 5000,
      grantSource: "topup",
    });

    const { request } = await createMoneyRequest({
      requesterTenantId: "a",
      to: "b@x.com",
      amountCents: 1000,
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        const accepted = yield* Effect.promise(() =>
          acceptMoneyRequest({ requestId: request.requestId, payerTenantId: "b" }, (input) =>
            Effect.runPromise(
              credits.stageTransfer({
                fromTenantId: input.fromTenantId,
                toTenantId: input.toTenantId,
                amountCents: input.amountCents,
                note: input.note,
                requestId: input.requestId,
              })
            )
          )
        );
        return yield* credits.confirmTransfer({
          actionId: accepted.staged.actionId,
          code: accepted.staged.confirmationCode,
        });
      }).pipe(Effect.provide(layer()))
    );

    const feedA = await getActivityFeed({ tenantId: "a", filter: "money" });
    const requestItems = feedA.items.filter((i) => i.requestId === request.requestId);
    expect(requestItems.length).toBe(0);
    expect(feedA.items.some((i) => i.kind === "transfer_received")).toBe(true);
  });
});
