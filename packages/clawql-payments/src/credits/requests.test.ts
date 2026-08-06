import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { resetPaymentsEffectRuntimeForTests, runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { CreditsLedgerService } from "./ledger.js";
import { CreditsDirectoryService } from "./directory.js";
import { CreditsService } from "./credits-service.js";
import { CreditsRequestsService, publicMoneyRequest } from "./requests.js";

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

  it("creates request to on-platform email", async () => {
    const { request, invite } = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "alice@acme.com", tenantId: "alice" });
        yield* directory.claim({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });
        const requests = yield* CreditsRequestsService;
        return yield* requests.create({
          requesterTenantId: "alice",
          to: "bob@acme.com",
          amountCents: 2500,
          note: "lunch",
        });
      })
    );
    expect(invite).toBe(false);
    expect(request.payerTenantId).toBe("bob");
    expect(request.payerHandle).toBe("bob");
    expect(request.status).toBe("pending");
    expect(publicMoneyRequest(request).invitePending).toBe(false);
  });

  it("creates invite when email unknown and claim-invite joins platform", async () => {
    const { request, invite, inviteToken } = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "alice@acme.com", tenantId: "alice" });
        const requests = yield* CreditsRequestsService;
        return yield* requests.create({
          requesterTenantId: "alice",
          to: "newbie@acme.com",
          amountCents: 1000,
        });
      })
    );
    expect(invite).toBe(true);
    expect(inviteToken).toBeTruthy();
    expect(request.payerTenantId).toBeUndefined();
    expect(request.inviteUrl).toMatch(/request\/invite/);
    expect(publicMoneyRequest(request).invitePending).toBe(true);

    const claimed = await runPaymentsEffect(
      Effect.gen(function* () {
        const requests = yield* CreditsRequestsService;
        return yield* requests.claimInvite({
          requestId: request.requestId,
          token: inviteToken!,
          tenantId: "newbie",
          handle: "newb",
        });
      })
    );
    expect(claimed.directoryCreated).toBe(true);
    expect(claimed.request.payerTenantId).toBe("newbie");
    expect(claimed.request.payerHandle).toBe("newb");
    expect(claimed.request.inviteTokenHash).toBeUndefined();
  });

  it("accept stages transfer and confirm marks request paid", async () => {
    const request = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "alice@acme.com", tenantId: "alice" });
        yield* directory.claim({ email: "bob@acme.com", tenantId: "bob" });
        const ledger = yield* CreditsLedgerService;
        yield* ledger.appendEntry({
          tenantId: "bob",
          kind: "topup_settled",
          deltaCents: 10_000,
          grantSource: "topup",
          note: "seed",
        });
        const requests = yield* CreditsRequestsService;
        const created = yield* requests.create({
          requesterTenantId: "alice",
          to: "bob@acme.com",
          amountCents: 1500,
          note: "invoice-1",
        });
        return created.request;
      })
    );

    const accepted = await runPaymentsEffect(
      Effect.gen(function* () {
        const requests = yield* CreditsRequestsService;
        const credits = yield* CreditsService;
        const staged = yield* credits.stageTransfer({
          fromTenantId: "bob",
          toTenantId: "alice",
          amountCents: request.amountCents,
          note: request.note,
          correlationId: request.correlationId,
          requestId: request.requestId,
        });
        const updated = yield* requests.markAccepted({
          requestId: request.requestId,
          payerTenantId: "bob",
          stagedTransferActionId: staged.actionId,
        });
        return { request: updated, staged };
      })
    );

    expect(accepted.request.status).toBe("accepted");
    expect(accepted.staged.actionId).toBeTruthy();

    const paid = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.confirmTransfer({
          actionId: accepted.staged.actionId,
          code: accepted.staged.confirmationCode,
        });
      })
    );

    expect(paid.amountCents).toBe(1500);
    const after = await runPaymentsEffect(
      Effect.gen(function* () {
        const requests = yield* CreditsRequestsService;
        return yield* requests.get(request.requestId);
      })
    );
    expect(after?.status).toBe("paid");
    expect(after?.paidTransferId).toBe(paid.transferId);

    const alice = await runPaymentsEffect(
      Effect.gen(function* () {
        const credits = yield* CreditsService;
        return yield* credits.getBalance("alice");
      })
    );
    expect(alice.balanceCents).toBe(1500);
  });

  it("decline, cancel, and list", async () => {
    const listed = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "a@x.com", tenantId: "a" });
        yield* directory.claim({ email: "b@x.com", tenantId: "b" });
        const requests = yield* CreditsRequestsService;
        const r1 = yield* requests.create({
          requesterTenantId: "a",
          to: "b@x.com",
          amountCents: 500,
        });
        yield* requests.decline({ requestId: r1.request.requestId, payerTenantId: "b" });
        expect((yield* requests.get(r1.request.requestId))?.status).toBe("declined");

        const r2 = yield* requests.create({
          requesterTenantId: "a",
          to: "b@x.com",
          amountCents: 700,
        });
        yield* requests.cancel({ requestId: r2.request.requestId, requesterTenantId: "a" });
        expect((yield* requests.get(r2.request.requestId))?.status).toBe("cancelled");

        return yield* requests.list({ tenantId: "a", role: "requester" });
      })
    );
    expect(listed.length).toBeGreaterThanOrEqual(2);
  });
});
