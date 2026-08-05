import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendCreditEntry, getCreditAccount, resetCreditsLedgerForTests } from "./ledger.js";
import {
  addOrgMember,
  allocateFromPoolToMember,
  createOrg,
  distributeOrgPeriod,
  resetOrgCreditsForTests,
  setOrgRolePolicies,
  transferWithinOrg,
} from "./org.js";
import { isCreditsOrgTransferEnabled } from "./config.js";

describe("org closed-loop credits", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-org-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    delete process.env.CLAWQL_CREDITS_ORG_TRANSFER_ENABLED;
    await resetCreditsLedgerForTests(process.env);
    await resetOrgCreditsForTests(process.env);
  });

  afterEach(async () => {
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    await rm(home, { recursive: true, force: true });
  });

  it("allows org transfer on managed hosting without P2P flag", () => {
    expect(isCreditsOrgTransferEnabled(process.env)).toBe(true);
  });

  it("creates org, allocates from pool, and peer-transfers within company only", async () => {
    const org = await createOrg(
      { orgId: "acme", billingAdminTenantId: "cfo", displayName: "Acme" },
      process.env
    );
    expect(org.poolTenantId).toBe("org:acme:pool");

    await setOrgRolePolicies(
      "acme",
      [
        { roleId: "intern", defaultGrantCents: 1000 },
        { roleId: "employee", defaultGrantCents: 2000 },
        { roleId: "senior", defaultGrantCents: 5000 },
      ],
      process.env
    );

    await addOrgMember(
      {
        orgId: "acme",
        memberTenantId: "intern1",
        allocationRoleId: "intern",
        actorTenantId: "cfo",
      },
      process.env
    );
    await addOrgMember(
      {
        orgId: "acme",
        memberTenantId: "senior1",
        allocationRoleId: "senior",
        actorTenantId: "cfo",
      },
      process.env
    );

    // Fund company pool (Stripe top-up analogue)
    await appendCreditEntry(
      {
        tenantId: org.poolTenantId,
        kind: "topup_settled",
        deltaCents: 20_000,
        grantSource: "topup",
        note: "monthly included credits",
      },
      process.env
    );

    await allocateFromPoolToMember(
      {
        orgId: "acme",
        toMemberTenantId: "intern1",
        amountCents: 1000,
        actorTenantId: "cfo",
      },
      process.env
    );
    await allocateFromPoolToMember(
      {
        orgId: "acme",
        toMemberTenantId: "senior1",
        amountCents: 5000,
        actorTenantId: "cfo",
      },
      process.env
    );

    expect((await getCreditAccount("intern1", process.env)).balanceCents).toBe(1000);
    expect((await getCreditAccount("senior1", process.env)).balanceCents).toBe(5000);

    // Senior helps intern within company
    await transferWithinOrg(
      {
        orgId: "acme",
        fromMemberTenantId: "senior1",
        toMemberTenantId: "intern1",
        amountCents: 500,
      },
      process.env
    );
    expect((await getCreditAccount("intern1", process.env)).balanceCents).toBe(1500);
    expect((await getCreditAccount("senior1", process.env)).balanceCents).toBe(4500);

    // Cross-org / outsider blocked
    await expect(
      transferWithinOrg(
        {
          orgId: "acme",
          fromMemberTenantId: "senior1",
          toMemberTenantId: "outsider",
          amountCents: 100,
        },
        process.env
      )
    ).rejects.toThrow(/active members/i);
  });

  it("distributes period grants from role policies and expires unused to pool", async () => {
    const org = await createOrg(
      {
        orgId: "beta",
        billingAdminTenantId: "cfo",
        periodEndPolicy: "expire_to_pool",
        rolePolicies: [
          { roleId: "intern", defaultGrantCents: 1000 },
          { roleId: "employee", defaultGrantCents: 2000 },
        ],
      },
      process.env
    );
    await addOrgMember(
      {
        orgId: "beta",
        memberTenantId: "intern1",
        allocationRoleId: "intern",
        actorTenantId: "cfo",
      },
      process.env
    );
    await appendCreditEntry(
      {
        tenantId: org.poolTenantId,
        kind: "topup_settled",
        deltaCents: 50_000,
        grantSource: "topup",
      },
      process.env
    );
    // Seed leftover on intern that should recall
    await appendCreditEntry(
      {
        tenantId: "intern1",
        kind: "grant",
        deltaCents: 300,
        grantSource: "adjust",
        note: "leftover",
      },
      process.env
    );

    const result = await distributeOrgPeriod(
      { orgId: "beta", actorTenantId: "cfo", idempotencyPrefix: "2026-08" },
      process.env
    );
    expect(result.recalled.some((r) => r.memberTenantId === "intern1")).toBe(true);
    expect(
      result.distributed.some((d) => d.memberTenantId === "intern1" && d.amountCents === 1000)
    ).toBe(true);
    expect((await getCreditAccount("intern1", process.env)).balanceCents).toBe(1000);
  });
});
