import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { isCreditsOrgTransferEnabled } from "./config.js";
import { CreditsLedgerService } from "./ledger.js";
import {
  addOrgMember,
  allocateFromPoolToMember,
  createOrg,
  distributeOrgPeriod,
  resetOrgCreditsForTests,
  setOrgRolePolicies,
  transferWithinOrg,
} from "./org.js";

describe("org closed-loop credits", () => {
  let home: string;

  const append = (input: {
    tenantId: string;
    kind: "topup_settled" | "grant";
    deltaCents: number;
    grantSource: "topup" | "adjust";
    note?: string;
  }) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.appendEntry(input);
      })
    );

  const balance = (tenantId: string) =>
    runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        return yield* ledger.getAccount(tenantId);
      })
    ).then((a) => a.balanceCents);

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "clawql-org-"));
    process.env.CLAWQL_HOME = home;
    process.env.CLAWQL_CREDITS_ENABLED = "1";
    process.env.CLAWQL_MANAGED_HOSTING = "1";
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    delete process.env.CLAWQL_CREDITS_ORG_TRANSFER_ENABLED;
    resetPaymentsEffectRuntimeForTests();
    await runPaymentsEffect(
      Effect.gen(function* () {
        const ledger = yield* CreditsLedgerService;
        yield* ledger.reset();
      })
    );
    await resetOrgCreditsForTests(process.env);
  });

  afterEach(async () => {
    resetPaymentsEffectRuntimeForTests();
    delete process.env.CLAWQL_HOME;
    delete process.env.CLAWQL_CREDITS_ENABLED;
    delete process.env.CLAWQL_MANAGED_HOSTING;
    delete process.env.CLAWQL_CREDITS_P2P_ENABLED;
    await rm(home, { recursive: true, force: true });
  });

  it("allows org transfer on managed hosting without P2P flag", () => {
    expect(Effect.runSync(isCreditsOrgTransferEnabled(process.env))).toBe(true);
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

    await append({
      tenantId: org.poolTenantId,
      kind: "topup_settled",
      deltaCents: 20_000,
      grantSource: "topup",
      note: "monthly included credits",
    });

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

    expect(await balance("intern1")).toBe(1000);
    expect(await balance("senior1")).toBe(5000);

    await transferWithinOrg(
      {
        orgId: "acme",
        fromMemberTenantId: "senior1",
        toMemberTenantId: "intern1",
        amountCents: 500,
      },
      process.env
    );
    expect(await balance("intern1")).toBe(1500);
    expect(await balance("senior1")).toBe(4500);

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
    await append({
      tenantId: org.poolTenantId,
      kind: "topup_settled",
      deltaCents: 50_000,
      grantSource: "topup",
    });
    await append({
      tenantId: "intern1",
      kind: "grant",
      deltaCents: 300,
      grantSource: "adjust",
      note: "leftover",
    });

    const result = await distributeOrgPeriod(
      { orgId: "beta", actorTenantId: "cfo", idempotencyPrefix: "2026-08" },
      process.env
    );
    expect(result.recalled.some((r) => r.memberTenantId === "intern1")).toBe(true);
    expect(
      result.distributed.some((d) => d.memberTenantId === "intern1" && d.amountCents === 1000)
    ).toBe(true);
    expect(await balance("intern1")).toBe(1000);
  });
});
