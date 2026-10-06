import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdentityStoreService, identityStoreLiveLayer } from "clawql-auth";
import { AuditLive, resetDefaultAuditRingBufferForTests } from "clawql-core";
import { SupabaseAuthError, SupabaseAuthService } from "clawql-supabase";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { paymentsConfigLiveLayer } from "../config/payments-config-service.js";
import { getOrg, orgCreditsLiveLayer, resetOrgCreditsForTests } from "../credits/org.js";
import { CreditsLedgerService } from "../credits/ledger.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { stripeBillingLiveLayer, StripeBillingService } from "../stripe/stripe-billing-service.js";
import { stripeClientLiveLayer } from "../stripe/stripe-client-service.js";
import { StripeApiError } from "../stripe/stripe-errors.js";
import {
  AccountDeletionIncompleteError,
  AccountDeletionService,
  accountDeletionLiveLayer,
} from "./account-deletion-service.js";
import {
  AccountDeletionJobStoreService,
  accountDeletionJobStoreLiveLayer,
} from "./account-deletion-job-store.js";
import { issuedApiKeyStoreLiveLayer, ProvisionOrgService } from "./provision-org-service.js";

const supabaseDeleteStubLayer = (): Layer.Layer<SupabaseAuthService> =>
  Layer.succeed(
    SupabaseAuthService,
    SupabaseAuthService.of({
      verifyAccessToken: () => Effect.fail(new SupabaseAuthError({ reason: "unused" })),
      signUpWithPassword: () => Effect.fail(new SupabaseAuthError({ reason: "unused" })),
      signInWithPassword: () => Effect.fail(new SupabaseAuthError({ reason: "unused" })),
      deleteAuthUser: () => Effect.void,
      sessionAuthenticatedAtSeconds: () => Effect.succeed(undefined),
      assertRecentAuthentication: () => Effect.void,
    })
  );

const stripeDeleteLayer = (
  deleteCustomer: (customerId: string) => Effect.Effect<void, StripeApiError>
): Layer.Layer<StripeBillingService> =>
  Layer.succeed(
    StripeBillingService,
    StripeBillingService.of({
      setup: () => Effect.die("unused"),
      createCustomer: () => Effect.die("unused"),
      createSubscription: () => Effect.die("unused"),
      createInvoice: () => Effect.die("unused"),
      createPortalSession: () => Effect.die("unused"),
      createCheckoutSession: () => Effect.die("unused"),
      deleteCustomer,
    })
  );

function testDeletionLayer(
  stripe?: Layer.Layer<StripeBillingService>
): Layer.Layer<
  | AccountDeletionService
  | AccountDeletionJobStoreService
  | IdentityStoreService
  | SupabaseAuthService
> {
  const env = process.env;
  const audit = paymentAuditLiveLayer(env).pipe(
    Layer.provide(Layer.mergeAll(AuditLive, lokiPushLiveLayer(env)))
  );
  const stripeLayer =
    stripe ??
    stripeBillingLiveLayer(env).pipe(
      Layer.provide(Layer.mergeAll(stripeClientLiveLayer(env), paymentsConfigLiveLayer(env)))
    );
  const deps = Layer.mergeAll(
    identityStoreLiveLayer(env),
    orgCreditsLiveLayer(env),
    issuedApiKeyStoreLiveLayer(env),
    audit,
    stripeLayer,
    supabaseDeleteStubLayer(),
    accountDeletionJobStoreLiveLayer(env)
  );
  return Layer.mergeAll(accountDeletionLiveLayer().pipe(Layer.provide(deps)), deps);
}

async function runDeletion<A, E, R>(
  program: Effect.Effect<A, E, R>,
  stripe?: Layer.Layer<StripeBillingService>
): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(testDeletionLayer(stripe))));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

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

  async function provisionUser(): Promise<{ userId: string; orgId: string }> {
    return runPaymentsEffect(
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
  }

  it("removes the org and writes hashed WORM refs only once systems complete", async () => {
    const { userId, orgId } = await provisionUser();

    const deleted = await runDeletion(
      Effect.gen(function* () {
        const del = yield* AccountDeletionService;
        return yield* del.deleteAccount({ clawqlUserId: userId });
      })
    );

    expect(deleted.status).toBe("completed");
    expect(deleted.wormWritten).toBe(true);
    expect(deleted.jobId).toMatch(/^adj_[a-f0-9]{32}$/);
    expect(deleted.orgsDeleted).toBeGreaterThanOrEqual(1);
    expect(deleted.userIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(deleted.steps.keys.status).toBe("completed");
    expect(deleted.steps.org.status).toBe("completed");
    expect(deleted.steps.supabase.status).toBe("completed");
    expect(await getOrg(orgId, process.env)).toBeUndefined();

    const leftover = await runPaymentsEffect(
      Effect.gen(function* () {
        const ids = yield* IdentityStoreService;
        return yield* ids.getByUserId(userId);
      })
    );
    expect(leftover).toBeUndefined();

    const entries = await listPaymentAuditEntries(20);
    const gone = entries.filter((e) => e.action === "ACCOUNT_DELETED");
    expect(gone).toHaveLength(1);
    const blob = JSON.stringify(gone[0]);
    expect(blob).not.toContain("sb-secret-subject");
    expect(blob).not.toContain("cus_secret_customer");
    expect(blob).not.toContain("gone@acme.com");
    expect(gone[0]?.payload.tenant_id).toMatch(/^sha256:[a-f0-9]{64}$/);

    const resumed = await runDeletion(
      Effect.gen(function* () {
        const del = yield* AccountDeletionService;
        return yield* del.resumeDeletion(deleted.jobId);
      })
    );
    expect(resumed.status).toBe("completed");
    expect(resumed.wormWritten).toBe(true);
    expect(
      (await listPaymentAuditEntries(20)).filter((e) => e.action === "ACCOUNT_DELETED")
    ).toHaveLength(1);
  });

  it("records a resumable job when Stripe fails and retries remaining steps idempotently", async () => {
    const { userId, orgId } = await provisionUser();
    let stripeCalls = 0;
    const failingStripe = stripeDeleteLayer(() => {
      stripeCalls += 1;
      if (stripeCalls === 1) {
        return Effect.fail(new StripeApiError({ reason: "simulated stripe outage" }));
      }
      return Effect.void;
    });

    await expect(
      runDeletion(
        Effect.gen(function* () {
          const del = yield* AccountDeletionService;
          return yield* del.deleteAccount({ clawqlUserId: userId });
        }),
        failingStripe
      )
    ).rejects.toBeInstanceOf(AccountDeletionIncompleteError);

    const open = await runDeletion(
      Effect.gen(function* () {
        const store = yield* AccountDeletionJobStoreService;
        return yield* store.findOpenByUserId(userId);
      }),
      failingStripe
    );
    expect(open).toBeTruthy();
    expect(open?.steps.stripe.status).toBe("failed");
    expect(open?.steps.supabase.status).toBe("pending");
    expect(open?.wormWritten).toBe(false);
    expect(await getOrg(orgId, process.env)).toBeUndefined();

    const stillThere = await runPaymentsEffect(
      Effect.gen(function* () {
        const ids = yield* IdentityStoreService;
        return yield* ids.getByUserId(userId);
      })
    );
    expect(stillThere).toBeTruthy();
    expect((await listPaymentAuditEntries(20)).some((e) => e.action === "ACCOUNT_DELETED")).toBe(
      false
    );

    const completed = await runDeletion(
      Effect.gen(function* () {
        const del = yield* AccountDeletionService;
        return yield* del.resumeDeletion(open!.jobId);
      }),
      failingStripe
    );
    expect(completed.status).toBe("completed");
    expect(completed.wormWritten).toBe(true);
    expect(completed.steps.stripe.status).toBe("completed");
    expect(completed.steps.supabase.status).toBe("completed");
    expect(stripeCalls).toBe(2);
    expect(
      (await listPaymentAuditEntries(20)).filter((e) => e.action === "ACCOUNT_DELETED")
    ).toHaveLength(1);

    const leftover = await runPaymentsEffect(
      Effect.gen(function* () {
        const ids = yield* IdentityStoreService;
        return yield* ids.getByUserId(userId);
      })
    );
    expect(leftover).toBeUndefined();
  });
});
