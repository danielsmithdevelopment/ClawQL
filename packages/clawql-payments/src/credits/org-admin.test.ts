import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCreditEntry, resetCreditsLedgerForTests } from "./ledger.js";
import {
  createOrg,
  findOrgByEmailDomain,
  inviteOrgMember,
  listOrgMembers,
  resetOrgCreditsForTests,
  setOrgSsoPolicy,
  suspendOrgMember,
  removeOrgMember,
} from "./org.js";
import { getOrgUnifiedSpendSummary } from "./org-spend.js";
import { renderOrgSpendPrometheus } from "./org-metrics.js";

describe("enterprise org admin + spend", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-ent-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    await resetCreditsLedgerForTests(process.env);
    await resetOrgCreditsForTests(process.env);
  });

  afterEach(async () => {
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    await rm(home, { recursive: true, force: true });
  });

  it("binds SSO domains, invites by company email, and suspends members", async () => {
    await createOrg(
      {
        orgId: "acme",
        billingAdminTenantId: "cfo",
        billingAdminEmail: "cfo@acme.com",
        allowedEmailDomains: ["acme.com"],
      },
      process.env
    );

    const byDomain = await findOrgByEmailDomain("acme.com", process.env);
    expect(byDomain?.orgId).toBe("acme");

    await setOrgSsoPolicy(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        allowedEmailDomains: ["acme.com", "acme.co.uk"],
      },
      process.env
    );

    await inviteOrgMember(
      {
        orgId: "acme",
        actorTenantId: "cfo",
        email: "intern@acme.com",
        allocationRoleId: "intern",
      },
      process.env
    );

    await expect(
      inviteOrgMember(
        {
          orgId: "acme",
          actorTenantId: "cfo",
          email: "outsider@gmail.com",
          allocationRoleId: "intern",
        },
        process.env
      )
    ).rejects.toThrow(/company domain/i);

    const members = await listOrgMembers("acme", { status: "active" }, process.env);
    expect(members.some((m) => m.email === "intern@acme.com")).toBe(true);

    const intern = members.find((m) => m.email === "intern@acme.com")!;
    await suspendOrgMember(
      { orgId: "acme", actorTenantId: "cfo", memberTenantId: intern.memberTenantId },
      process.env
    );
    const after = await listOrgMembers("acme", { status: "any" }, process.env);
    expect(after.find((m) => m.memberTenantId === intern.memberTenantId)?.status).toBe(
      "suspended"
    );

    await removeOrgMember(
      { orgId: "acme", actorTenantId: "cfo", memberTenantId: intern.memberTenantId },
      process.env
    );
    expect(
      (await listOrgMembers("acme", { status: "any" }, process.env)).find(
        (m) => m.memberTenantId === intern.memberTenantId
      )?.status
    ).toBe("left");
  });

  it("builds unified spend summary and prometheus metrics", async () => {
    await createOrg(
      { orgId: "acme", billingAdminTenantId: "cfo", allowedEmailDomains: ["acme.com"] },
      process.env
    );
    await appendCreditEntry(
      {
        tenantId: "org:acme:pool",
        kind: "topup_settled",
        deltaCents: 10_000,
        grantSource: "topup",
        note: "stripe",
      },
      process.env
    );

    const summary = await getOrgUnifiedSpendSummary(
      { orgId: "acme", actorTenantId: "cfo" },
      process.env
    );
    expect(summary.poolBalanceCents).toBe(10_000);
    expect(summary.totalCreditsCents).toBeGreaterThanOrEqual(10_000);

    const prom = renderOrgSpendPrometheus(summary);
    expect(prom).toContain("clawql_org_pool_balance_cents");
    expect(prom).toContain('org_id="acme"');
  });
});
