import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCreditEntry, getCreditAccount, resetCreditsLedgerForTests } from "./ledger.js";
import {
  addOrgMember,
  createOrg,
  inviteOrgMember,
  resetOrgCreditsForTests,
  setMemberReportsTo,
  setOrgSeatPolicy,
  transferManagerToReport,
} from "./org.js";
import { createOrgCreditsIdpRouter } from "./org-idp-router.js";
import { holdOrgWaterfall } from "./org-waterfall.js";
import {
  renderOrgWaterfallPrometheus,
  resetOrgWaterfallMetricsForTests,
} from "./org-waterfall-metrics.js";

describe("enterprise next slices: seats, manager, waterfall, idp router", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ent2-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    await resetCreditsLedgerForTests(process.env);
    await resetOrgCreditsForTests(process.env);
    resetOrgWaterfallMetricsForTests();
  });

  afterEach(async () => {
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    await rm(home, { recursive: true, force: true });
  });

  it("enforces seat limits from plan / seatLimit", async () => {
    await createOrg(
      {
        orgId: "acme",
        billingAdminTenantId: "cfo",
        planId: "free",
        allowedEmailDomains: ["acme.com"],
      },
      process.env
    );
    // free plan = 1 seat (cfo already occupies it)
    await expect(
      inviteOrgMember(
        {
          orgId: "acme",
          actorTenantId: "cfo",
          email: "intern@acme.com",
          allocationRoleId: "intern",
        },
        process.env
      )
    ).rejects.toThrow(/seat limit/i);

    await setOrgSeatPolicy({ orgId: "acme", actorTenantId: "cfo", seatLimit: 5 }, process.env);
    await inviteOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        email: "intern@acme.com",
        allocationRoleId: "intern",
      },
      process.env
    );
  });

  it("allows manager transfer only to direct reports", async () => {
    await createOrg({ orgId: "acme", billingAdminTenantId: "cfo" }, process.env);
    await addOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        memberTenantId: "mgr1",
        allocationRoleId: "senior",
        orgRole: "manager",
      },
      process.env
    );
    await addOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        memberTenantId: "intern1",
        allocationRoleId: "intern",
        reportsToTenantId: "mgr1",
      },
      process.env
    );
    await addOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        memberTenantId: "other",
        allocationRoleId: "employee",
      },
      process.env
    );

    await appendCreditEntry(
      {
        tenantId: "mgr1",
        kind: "topup_settled",
        deltaCents: 5000,
        grantSource: "topup",
      },
      process.env
    );

    await transferManagerToReport(
      {
        orgId: "acme",
        managerTenantId: "mgr1",
        reportTenantId: "intern1",
        amountCents: 500,
      },
      process.env
    );
    expect((await getCreditAccount("intern1", process.env)).balanceCents).toBe(500);

    await expect(
      transferManagerToReport(
        {
          orgId: "acme",
          managerTenantId: "mgr1",
          reportTenantId: "other",
          amountCents: 100,
        },
        process.env
      )
    ).rejects.toThrow(/direct report/i);

    await setMemberReportsTo(
      {
        orgId: "acme",
        memberTenantId: "other",
        reportsToTenantId: "mgr1",
        actorTenantId: "cfo",
      },
      process.env
    );
  });

  it("holds member → pool → overage waterfall", async () => {
    await createOrg({ orgId: "acme", billingAdminTenantId: "cfo" }, process.env);
    await addOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        memberTenantId: "intern1",
        allocationRoleId: "intern",
      },
      process.env
    );
    await appendCreditEntry(
      {
        tenantId: "intern1",
        kind: "topup_settled",
        deltaCents: 300,
        grantSource: "topup",
      },
      process.env
    );
    await appendCreditEntry(
      {
        tenantId: "org:acme:pool",
        kind: "topup_settled",
        deltaCents: 500,
        grantSource: "topup",
      },
      process.env
    );

    const result = await holdOrgWaterfall(
      {
        orgId: "acme",
        memberTenantId: "intern1",
        amountCents: 1000,
        idempotencyKey: "inf-1",
        allowOverage: true,
      },
      process.env
    );

    expect(result.slices.map((s) => s.kind)).toEqual(["member", "pool", "overage"]);
    expect(result.slices.find((s) => s.kind === "member")?.amountCents).toBe(300);
    expect(result.slices.find((s) => s.kind === "pool")?.amountCents).toBe(500);
    expect(result.overageCents).toBe(200);
    expect(result.fullyCoveredByCredits).toBe(false);

    const prom = renderOrgWaterfallPrometheus();
    expect(prom).toContain("clawql_org_waterfall_hold_cents_total");
    expect(prom).toContain('source="overage"');
  });

  it("createOrgCreditsIdpRouter resolves by domain", async () => {
    await createOrg(
      {
        orgId: "acme",
        billingAdminTenantId: "cfo",
        allowedEmailDomains: ["acme.com"],
        ssoIssuer: "https://idp.acme.com",
        ssoJwksUrl: "https://idp.acme.com/jwks",
      },
      process.env
    );
    const router = createOrgCreditsIdpRouter(process.env);
    const route = await Effect.runPromise(router.resolveByEmailDomain("acme.com"));
    expect(route?.orgId).toBe("acme");
    expect(route?.jwksUrl).toBe("https://idp.acme.com/jwks");
  });
});
