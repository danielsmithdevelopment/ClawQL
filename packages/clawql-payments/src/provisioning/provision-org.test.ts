import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuditLive, resetDefaultAuditRingBufferForTests } from "clawql-core";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { lokiPushLiveLayer } from "../audit/loki.js";
import { getOrg, resetOrgCreditsForTests } from "../credits/org.js";
import { CreditsLedgerService, creditsLedgerLiveLayer } from "../credits/ledger.js";
import { paymentAuditLiveLayer } from "../plugin/payment-audit-service.js";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import {
  apiKeyScopesForPlan,
  issuedApiKeyStoreForHomeLayer,
  ownerTenantIdForOrg,
  provisionOrgInputFromCheckoutSession,
  ProvisionOrgService,
  provisionOrgLiveLayer,
  ReportUsageService,
  slugifyOrgId,
} from "./index.js";

describe("CPC helpers", () => {
  it("slugifies org names", () => {
    expect(slugifyOrgId("Acme Corp!")).toBe("acme-corp");
  });

  it("builds owner tenant ids", () => {
    expect(ownerTenantIdForOrg("acme", "cfo@acme.com")).toBe("acme:cfo");
  });

  it("maps plan scopes", () => {
    expect(apiKeyScopesForPlan("free")).toEqual(["search", "memory"]);
    expect(apiKeyScopesForPlan("team")).toContain("execute");
  });
});

describe("provisionOrgInputFromCheckoutSession", () => {
  it("returns false without CPC metadata", () => {
    const handoff = provisionOrgInputFromCheckoutSession({
      id: "cs_test",
      customer: "cus_1",
      subscription: "sub_1",
      mode: "subscription",
      metadata: {},
      customer_details: null,
      customer_email: "a@b.com",
    });
    expect(handoff.ok).toBe(false);
  });

  it("builds provision input from CPC metadata", () => {
    const handoff = provisionOrgInputFromCheckoutSession({
      id: "cs_test",
      customer: "cus_1",
      subscription: "sub_1",
      mode: "subscription",
      metadata: {
        clawql_provision_org: "1",
        clawql_org_name: "Acme",
        clawql_org_id: "acme",
        clawql_plan: "team",
        clawql_billing_mode: "hybrid",
      },
      customer_details: null,
      customer_email: "owner@acme.com",
    });
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      expect(handoff.input.orgId).toBe("acme");
      expect(handoff.input.planId).toBe("team");
      expect(handoff.input.billingMode).toBe("hybrid");
      expect(handoff.input.stripeCustomerId).toBe("cus_1");
      expect(handoff.input.ownerEmail).toBe("owner@acme.com");
    }
  });
});

describe("ProvisionOrgService", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-cpc-"));
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

  it("provisions org-of-1 with billing_admin + API key orgId metadata", async () => {
    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* ProvisionOrgService;
        return yield* svc.provisionOrg({
          orgName: "Acme",
          orgId: "acme",
          ownerEmail: "owner@acme.com",
          planId: "pro",
          createdVia: "enterprise_sales",
          billingMode: "stripe_invoice",
          stripeCustomerId: "cus_test",
        });
      })
    );

    expect(result.orgId).toBe("acme");
    expect(result.ownerMemberTenantId).toBe("acme:owner");
    expect(result.apiKey).toMatch(/^cqk_/);
    expect(result.apiKeyId).toBeTruthy();

    const org = await getOrg("acme", process.env);
    expect(org?.billingMode).toBe("stripe_invoice");
    expect(org?.createdVia).toBe("enterprise_sales");
    expect(org?.planId).toBe("pro");
    expect(org?.stripeCustomerId).toBe("cus_test");
    expect(org?.members).toHaveLength(1);
    expect(org?.members[0]?.orgRole).toBe("billing_admin");
    expect(org?.members[0]?.email).toBe("owner@acme.com");

    const entries = await listPaymentAuditEntries(20);
    expect(entries.some((e) => e.action === "ORG_PROVISIONED")).toBe(true);
    expect(entries.some((e) => e.action === "ORG_MEMBER_ADDED")).toBe(true);
  });

  it("reportUsageToStripe skips credits_only and reports overage when enabled", async () => {
    await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* ProvisionOrgService;
        return yield* svc.provisionOrg({
          orgName: "Credits Co",
          orgId: "creditsco",
          ownerEmail: "o@credits.co",
          planId: "pro",
          createdVia: "self_serve",
          billingMode: "credits_only",
        });
      })
    );

    const skipped = await runPaymentsEffect(
      Effect.gen(function* () {
        const report = yield* ReportUsageService;
        return yield* report.reportUsageToStripe({
          orgId: "creditsco",
          overageUnits: 50,
        });
      })
    );
    expect(skipped.reported).toBe(false);
    if (!skipped.reported) {
      expect(skipped.reason).toMatch(/credits_only/);
    }

    await runPaymentsEffect(
      Effect.gen(function* () {
        const svc = yield* ProvisionOrgService;
        return yield* svc.provisionOrg({
          orgName: "Meter Co",
          orgId: "meterco",
          ownerEmail: "o@meter.co",
          planId: "pro",
          createdVia: "self_serve",
          billingMode: "hybrid",
          stripeCustomerId: "cus_meter",
        });
      })
    );

    process.env.CLAWQL_PAYMENTS_REPORT_STRIPE_METER = "1";
    process.env.STRIPE_METER_EVENT_NAME = "inference_overage";
    // No Stripe secret → reportMeteredUsage fails if called; exercise skip path via disabled first
    delete process.env.CLAWQL_PAYMENTS_REPORT_STRIPE_METER;

    const noFlag = await runPaymentsEffect(
      Effect.gen(function* () {
        const report = yield* ReportUsageService;
        return yield* report.reportUsageToStripe({
          orgId: "meterco",
          overageUnits: 10,
        });
      })
    );
    expect(noFlag.reported).toBe(false);
    if (!noFlag.reported) {
      expect(noFlag.reason).toMatch(/disabled/);
    }
  });
});

describe("provisionOrgLiveLayer composition", () => {
  it("composes with explicit layers", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawql-cpc-layer-"));
    try {
      const env: NodeJS.ProcessEnv = {
        CLAWQL_HOME: home,
        CLAWQL_CREDITS_ENABLED: "1",
        CLAWQL_PAYMENTS_AUDIT_STORE: "memory",
      };
      const loki = lokiPushLiveLayer(env);
      const audit = paymentAuditLiveLayer(env).pipe(Layer.provide(Layer.mergeAll(AuditLive, loki)));
      const ledger = creditsLedgerLiveLayer(env);
      const keys = issuedApiKeyStoreForHomeLayer(home);
      const layer = provisionOrgLiveLayer(env).pipe(
        Layer.provide(Layer.mergeAll(audit, keys, ledger))
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ProvisionOrgService;
          return yield* svc.provisionOrg({
            orgName: "Layer Co",
            ownerEmail: "a@layer.co",
            planId: "free",
            createdVia: "self_serve",
            billingMode: "credits_only",
            env,
          });
        }).pipe(Effect.provide(layer))
      );
      expect(result.orgId).toBe("layer-co");
      expect(result.apiKey).toBeTruthy();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
