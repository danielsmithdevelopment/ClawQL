/**
 * Unified org spend / billing snapshot for company admins (CFO view).
 * Joins closed-loop credit balances with optional payment WORM rows for the org.
 */

import { buildSpendReport, type SpendReport } from "../audit/reconcile.js";
import { listPaymentAuditEntries } from "../audit/worm.js";
import { getCreditAccount, spendableBalanceCents } from "./ledger.js";
import { getOrg, type OrgMembership, type OrgRecord } from "./org.js";

export type OrgMemberBalanceRow = {
  memberTenantId: string;
  email?: string;
  displayName?: string;
  orgRole: OrgMembership["orgRole"];
  allocationRoleId: string;
  status: OrgMembership["status"];
  balanceCents: number;
  spendableCents: number;
};

export type OrgUnifiedSpendSummary = {
  orgId: string;
  displayName?: string;
  poolTenantId: string;
  poolBalanceCents: number;
  poolSpendableCents: number;
  memberBalanceCents: number;
  totalCreditsCents: number;
  members: OrgMemberBalanceRow[];
  /** WORM payment spend for tenant ids belonging to this org (pool + members). */
  wormSpend?: SpendReport;
  generatedAt: string;
};

/**
 * CFO snapshot: pool + per-member credit balances, optionally enriched with WORM spend.
 */
export async function getOrgUnifiedSpendSummary(
  input: {
    orgId: string;
    actorTenantId?: string;
    includeWormSpend?: boolean;
    wormLimit?: number;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgUnifiedSpendSummary> {
  const org = await getOrg(input.orgId, env);
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  if (input.actorTenantId) {
    if (!org.billingAdminTenantIds.includes(input.actorTenantId.trim())) {
      throw new Error(`Actor ${input.actorTenantId} is not a billing admin for org ${org.orgId}`);
    }
  }

  const pool = await getCreditAccount(org.poolTenantId, env);
  const members: OrgMemberBalanceRow[] = [];
  let memberBalanceCents = 0;

  for (const m of org.members) {
    const acct = await getCreditAccount(m.memberTenantId, env);
    memberBalanceCents += acct.balanceCents;
    members.push({
      memberTenantId: m.memberTenantId,
      email: m.email,
      displayName: m.displayName,
      orgRole: m.orgRole,
      allocationRoleId: m.allocationRoleId,
      status: m.status,
      balanceCents: acct.balanceCents,
      spendableCents: spendableBalanceCents(acct),
    });
  }

  let wormSpend: SpendReport | undefined;
  if (input.includeWormSpend) {
    wormSpend = await loadOrgWormSpend(org, input.wormLimit ?? 10_000);
  }

  return {
    orgId: org.orgId,
    displayName: org.displayName,
    poolTenantId: org.poolTenantId,
    poolBalanceCents: pool.balanceCents,
    poolSpendableCents: spendableBalanceCents(pool),
    memberBalanceCents,
    totalCreditsCents: pool.balanceCents + memberBalanceCents,
    members,
    wormSpend,
    generatedAt: new Date().toISOString(),
  };
}

async function loadOrgWormSpend(org: OrgRecord, limit: number): Promise<SpendReport> {
  const tenantIds = new Set<string>([
    org.poolTenantId,
    ...org.members.map((m) => m.memberTenantId),
  ]);
  const entries = await listPaymentAuditEntries(limit);
  const filtered = entries.filter((e) => tenantIds.has(e.payload.tenant_id));
  return buildSpendReport(filtered, "tenant");
}
