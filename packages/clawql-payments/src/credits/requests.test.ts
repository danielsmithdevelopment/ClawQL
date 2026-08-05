import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLive } from "clawql-core";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
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
import {
  acceptMoneyRequest,
  cancelMoneyRequest,
  claimMoneyRequestInvite,
  createMoneyRequest,
  declineMoneyRequest,
  getMoneyRequest,
  listMoneyRequests,
  publicMoneyRequest,
  resetMoneyRequestsForTests,
} from "./requests.js";

describe("money requests / invoices", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-req-"));
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
    delete process.env.CLAWQL_CREDITS_TRANSFER_DIRECT;
    await rm(home, { recursive: true, force: true });
  });

  const layer = () => {
    const audit = paymentAuditLiveLayer(process.env).pipe(Layer.provide(AuditLive));
    const ledger = creditsLedgerLiveLayer(process.env);
    const stepUp = creditsStepUpLiveLayer(process.env);
    const pending = pendingActionsLiveLayer(process.env);
    return creditsLiveLayer(process.env).pipe(
      Layer.provide(Layer.mergeAll(audit, ledger, stepUp, pending))
    );
  };

  it("creates request to on-platform email", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });

    const { request, invite } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "bob@acme.com",
      amountCents: 2500,
      note: "lunch",
    });
    expect(invite).toBe(false);
    expect(request.payerTenantId).toBe("bob");
    expect(request.payerHandle).toBe("bob");
    expect(request.status).toBe("pending");
    expect(publicMoneyRequest(request).invitePending).toBe(false);
  });

  it("creates invite when email unknown and claim-invite joins platform", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });

    const { request, invite, inviteToken } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "newbie@acme.com",
      amountCents: 1000,
    });
    expect(invite).toBe(true);
    expect(inviteToken).toBeTruthy();
    expect(request.payerTenantId).toBeUndefined();
    expect(request.inviteUrl).toMatch(/request\/invite/);
    expect(publicMoneyRequest(request).invitePending).toBe(true);

    const claimed = await claimMoneyRequestInvite({
      requestId: request.requestId,
      token: inviteToken!,
      tenantId: "newbie",
      handle: "newb",
    });
    expect(claimed.directoryCreated).toBe(true);
    expect(claimed.request.payerTenantId).toBe("newbie");
    expect(claimed.request.payerHandle).toBe("newb");
    expect(claimed.request.inviteTokenHash).toBeUndefined();
  });

  it("accept stages transfer and confirm marks request paid", async () => {
    await claimDirectory({ email: "alice@acme.com", tenantId: "alice" });
    await claimDirectory({ email: "bob@acme.com", tenantId: "bob" });
    await appendCreditEntry({
      tenantId: "bob",
      kind: "topup_settled",
      deltaCents: 10_000,
      grantSource: "topup",
      note: "seed",
    });

    const { request } = await createMoneyRequest({
      requesterTenantId: "alice",
      to: "bob@acme.com",
      amountCents: 1500,
      note: "invoice-1",
    });

    const accepted = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* Effect.promise(() =>
          acceptMoneyRequest({ requestId: request.requestId, payerTenantId: "bob" }, (input) =>
            Effect.runPromise(
              credits.stageTransfer({
                fromTenantId: input.fromTenantId,
                toTenantId: input.toTenantId,
                amountCents: input.amountCents,
                note: input.note,
                correlationId: input.correlationId,
                requestId: input.requestId,
              })
            )
          )
        );
      }).pipe(Effect.provide(layer()))
    );

    expect(accepted.request.status).toBe("accepted");
    expect(accepted.staged.actionId).toBeTruthy();

    const paid = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: accepted.staged.actionId,
          code: accepted.staged.confirmationCode,
        });
      }).pipe(Effect.provide(layer()))
    );

    expect(paid.amountCents).toBe(1500);
    const after = await getMoneyRequest(request.requestId);
    expect(after?.status).toBe("paid");
    expect(after?.paidTransferId).toBe(paid.transferId);

    const alice = await Effect.runPromise(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.getBalance("alice");
      }).pipe(Effect.provide(layer()))
    );
    expect(alice.balanceCents).toBe(1500);
  });

  it("decline, cancel, and list", async () => {
    await claimDirectory({ email: "a@x.com", tenantId: "a" });
    await claimDirectory({ email: "b@x.com", tenantId: "b" });
    const { request: r1 } = await createMoneyRequest({
      requesterTenantId: "a",
      to: "b@x.com",
      amountCents: 500,
    });
    await declineMoneyRequest({ requestId: r1.requestId, payerTenantId: "b" });
    expect((await getMoneyRequest(r1.requestId))?.status).toBe("declined");

    const { request: r2 } = await createMoneyRequest({
      requesterTenantId: "a",
      to: "b@x.com",
      amountCents: 700,
    });
    await cancelMoneyRequest({ requestId: r2.requestId, requesterTenantId: "a" });
    expect((await getMoneyRequest(r2.requestId))?.status).toBe("cancelled");

    const listed = await listMoneyRequests({ tenantId: "a", role: "requester" });
    expect(listed.length).toBeGreaterThanOrEqual(2);
  });
});
