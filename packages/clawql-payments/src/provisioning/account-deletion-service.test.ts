import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdentityStoreService } from "clawql-auth";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { getOrg, resetOrgCreditsForTests } from "../credits/org.js";
import { CreditsLedgerService } from "../credits/ledger.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { AccountDeletionService } from "./account-deletion-service.js";
import { ProvisionOrgService } from "./provision-org-service.js";

describe("AccountDeletionService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-account-del-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    resetDefaultAuditRingBufferForTests();
    resetPaymentsEffectRuntimeForTests();
    await resetPaymentAuditStoreForTests(process.env);
    await resetOrgCreditsForTests(process.env);
    await runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.reset();
      })
    );
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    await rm(home, { recursive: true, force: true });
  });

  it("removes the org and writes hashed WORM refs only", async () => {
    const { userId, orgId } = await runPaymentsEffect(
      Effect.gen(function* () {
        const ids = yield* IdentityStoreService;
        const user = yield* ids.getOrCreateFromLinkedIdentity({
          provider: "supabase",
          subject: "sb-secret-subject",
          email: "gone@acme.com",
        });
        const svc = yield* ProvisionOrgService;
        const provisioned = yield* svc.provisionOrg({
          orgName: "Delete Co",
          orgId: "deleteco",
          ownerEmail: "gone@acme.com",
          planId: "pro",
          createdVia: "self_serve",
          billingMode: "credits_only",
          ownerMemberTenantId: user.userId,
          clawqlUserId: user.userId,
          stripeCustomerId: "cus_secret_customer",
        });
        return { userId: user.userId, orgId: provisioned.orgId };
      })
    );

    const deleted = await runPaymentsEffect(
      Effect.gen(function* () {
        const del = yield* AccountDeletionService;
        return yield* del.deleteAccount({ clawqlUserId: userId });
      })
    );

    expect(deleted.orgsDeleted).toBeGreaterThanOrEqual(1);
    expect(deleted.userIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await getOrg(orgId, process.env)).toBeUndefined();

    const leftover = await runPaymentsEffect(
      Effect.gen(function* () {
        const ids = yield* IdentityStoreService;
        return yield* ids.getByUserId(userId);
      })
    );
    expect(leftover).toBeUndefined();

    const entries = await listPaymentAuditEntries(20);
    const gone = entries.find((e) => e.action === "ACCOUNT_DELETED");
    expect(gone).toBeTruthy();
    const blob = JSON.stringify(gone);
    expect(blob).not.toContain("sb-secret-subject");
    expect(blob).not.toContain("cus_secret_customer");
    expect(blob).not.toContain("gone@acme.com");
    expect(gone?.payload.tenant_id).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
