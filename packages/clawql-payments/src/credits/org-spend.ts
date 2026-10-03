/**
 * Unified org spend / billing snapshot for company admins (CFO view).
 * Joins closed-loop credit balances with optional payment WORM rows for the org.
 */

import { Context, Data, Effect, Layer } from "effect";
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

export type GetOrgUnifiedSpendSummaryInput = {
  orgId: string;
  actorTenantId?: string;
  includeWormSpend?: boolean;
  wormLimit?: number;
};

export class OrgSpendError extends Data.TaggedError("OrgSpendError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * CFO snapshot: pool + per-member credit balances, optionally enriched with WORM spend.
 */
export function getOrgUnifiedSpendSummaryEffect(
  input: GetOrgUnifiedSpendSummaryInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<OrgUnifiedSpendSummary, OrgSpendError> {
  return Effect.gen(function* () {
    const org = yield* Effect.tryPromise({
      try: () => getOrg(input.orgId, env),
      catch: (cause) =>
        new OrgSpendError({
          reason: cause instanceof Error ? cause.message : "Failed to load org",
          cause,
        }),
    });
    if (!org) {
      return yield* Effect.fail(new OrgSpendError({ reason: `Unknown org: ${input.orgId}` }));
    }
    if (input.actorTenantId) {
      if (!org.billingAdminTenantIds.includes(input.actorTenantId.trim())) {
        return yield* Effect.fail(
          new OrgSpendError({
            reason: `Actor ${input.actorTenantId} is not a billing admin for org ${org.orgId}`,
          })
        );
      }
    }

    const pool = yield* Effect.tryPromise({
      try: () => getCreditAccount(org.poolTenantId, env),
      catch: (cause) =>
        new OrgSpendError({
          reason: cause instanceof Error ? cause.message : "Failed to load pool account",
          cause,
        }),
    });
    const members: OrgMemberBalanceRow[] = [];
    let memberBalanceCents = 0;

    for (const m of org.members) {
      const acct = yield* Effect.tryPromise({
        try: () => getCreditAccount(m.memberTenantId, env),
        catch: (cause) =>
          new OrgSpendError({
            reason: cause instanceof Error ? cause.message : "Failed to load member account",
            cause,
          }),
      });
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
      wormSpend = yield* loadOrgWormSpendEffect(org, input.wormLimit ?? 10_000);
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
  });
}

function loadOrgWormSpendEffect(
  org: OrgRecord,
  limit: number
): Effect.Effect<SpendReport, OrgSpendError> {
  return Effect.tryPromise({
    try: async () => {
      const tenantIds = new Set<string>([
        org.poolTenantId,
        ...org.members.map((m) => m.memberTenantId),
      ]);
      const entries = await listPaymentAuditEntries(limit);
      const filtered = entries.filter((e) => tenantIds.has(e.payload.tenant_id));
      return buildSpendReport(filtered, "tenant");
    },
    catch: (cause) =>
      new OrgSpendError({
        reason: cause instanceof Error ? cause.message : "Failed to load WORM spend",
        cause,
      }),
  });
}

/** Promise façade for CLI / Express dashboard callers. */
export async function getOrgUnifiedSpendSummary(
  input: GetOrgUnifiedSpendSummaryInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgUnifiedSpendSummary> {
  return Effect.runPromise(getOrgUnifiedSpendSummaryEffect(input, env));
}

/** Effect surface over unified org spend snapshots. */
export class OrgSpendService extends Context.Service<
  OrgSpendService,
  {
    readonly getUnifiedSummary: (
      input: GetOrgUnifiedSpendSummaryInput
    ) => Effect.Effect<OrgUnifiedSpendSummary, OrgSpendError>;
  }
>()("clawql/OrgSpendService") {}

export function orgSpendLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<OrgSpendService> {
  return Layer.succeed(
    OrgSpendService,
    OrgSpendService.of({
      getUnifiedSummary: (input) => getOrgUnifiedSpendSummaryEffect(input, env),
    })
  );
}
