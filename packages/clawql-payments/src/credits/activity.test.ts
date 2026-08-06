import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentAuditStoreForTests } from "../audit/worm.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { CreditsLedgerService } from "./ledger.js";
import { CreditsDirectoryService } from "./directory.js";
import { CreditsService } from "./credits-service.js";
import { CreditsRequestsService } from "./requests.js";
import { CreditsActivityService, formatActivityLine } from "./activity.js";

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
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    await rm(home, { recursive: true, force: true });
  });

  it("merges transfers and open requests with directory labels", async () => {
    const { feed, request } = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "alice@acme.com", tenantId: "alice", handle: "alice" });
        yield* directory.claim({ email: "bob@acme.com", tenantId: "bob", handle: "bob" });
        const ledger = yield* CreditsLedgerService;
        yield* ledger.appendEntry({
          tenantId: "alice",
          kind: "topup_settled",
          deltaCents: 10_000,
          grantSource: "topup",
          note: "seed",
        });
        const credits = yield* CreditsService;
        yield* credits.transfer({
          fromTenantId: "alice",
          toTenantId: "bob",
          amountCents: 2000,
          note: "coffee",
        });
        const requests = yield* CreditsRequestsService;
        const created = yield* requests.create({
          requesterTenantId: "alice",
          to: "bob@acme.com",
          amountCents: 1500,
          note: "lunch",
        });
        const activity = yield* CreditsActivityService;
        const feed = yield* activity.getFeed({ tenantId: "alice", limit: 20, filter: "money" });
        return { feed, request: created.request };
      })
    );

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
    const { feedA, request } = await runPaymentsEffect(
      Effect.gen(function* () {
        const directory = yield* CreditsDirectoryService;
        yield* directory.claim({ email: "a@x.com", tenantId: "a" });
        yield* directory.claim({ email: "b@x.com", tenantId: "b" });
        const ledger = yield* CreditsLedgerService;
        yield* ledger.appendEntry({
          tenantId: "b",
          kind: "topup_settled",
          deltaCents: 5000,
          grantSource: "topup",
        });

        const requests = yield* CreditsRequestsService;
        const created = yield* requests.create({
          requesterTenantId: "a",
          to: "b@x.com",
          amountCents: 1000,
        });
        const request = created.request;

        const credits = yield* CreditsService;
        const staged = yield* credits.stageTransfer({
          fromTenantId: "b",
          toTenantId: "a",
          amountCents: request.amountCents,
          note: request.note,
          correlationId: request.correlationId,
          requestId: request.requestId,
        });
        yield* requests.markAccepted({
          requestId: request.requestId,
          payerTenantId: "b",
          stagedTransferActionId: staged.actionId,
        });
        yield* credits.confirmTransfer({
          actionId: staged.actionId,
          code: staged.confirmationCode,
        });

        const activity = yield* CreditsActivityService;
        const feedA = yield* activity.getFeed({ tenantId: "a", filter: "money" });
        return { feedA, request };
      })
    );

    const requestItems = feedA.items.filter((i) => i.requestId === request.requestId);
    expect(requestItems.length).toBe(0);
    expect(feedA.items.some((i) => i.kind === "transfer_received")).toBe(true);
  });
});
