import { getOrgUnifiedSpendSummaryEffect } from "clawql-payments";
import { Effect } from "effect";

import { DAILY_SPEND, TEAM_SPEND, USAGE_SUMMARY } from "@/lib/managed/fixtures";
import {
  managedOrgId,
  managedTenantId,
  readManagedDataSource,
  resolveWithFallbackEffect,
} from "@/lib/managed/data-source";

export type ManagedUsageSnapshot = {
  readonly monthSpent: number;
  readonly monthBudget: number;
  readonly forecast: number;
  readonly forecastNote: string;
  readonly todaySpent: number;
  readonly todayNote: string;
  readonly planRenews: string;
  readonly teamRows: readonly {
    readonly team: string;
    readonly spent: number;
    readonly budget: number;
    readonly requests: number;
    readonly toolCalls: number;
    readonly alert?: string;
  }[];
  readonly daily: readonly {
    readonly label: string;
    readonly amount: number;
    readonly weekend?: boolean;
    readonly today?: boolean;
  }[];
  readonly meta: {
    readonly orgId: string;
    readonly totalCreditsCents: number;
    readonly poolSpendableCents: number;
    readonly memberCount: number;
    readonly generatedAt: string;
  };
};

const FIXTURE_USAGE: ManagedUsageSnapshot = {
  monthSpent: USAGE_SUMMARY.monthSpent,
  monthBudget: USAGE_SUMMARY.monthBudget,
  forecast: USAGE_SUMMARY.forecast,
  forecastNote: USAGE_SUMMARY.forecastNote,
  todaySpent: USAGE_SUMMARY.todaySpent,
  todayNote: USAGE_SUMMARY.todayNote,
  planRenews: USAGE_SUMMARY.planRenews,
  teamRows: TEAM_SPEND,
  daily: DAILY_SPEND,
  meta: {
    orgId: "fixture",
    totalCreditsCents: 0,
    poolSpendableCents: 0,
    memberCount: TEAM_SPEND.length,
    generatedAt: new Date(0).toISOString(),
  },
};

function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export const loadManagedUsageEffect = (
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<{ readonly usage: ManagedUsageSnapshot; readonly source: "live" | "fixture" }> => {
  const orgId = managedOrgId(env);
  const actorTenantId = managedTenantId(env);

  return resolveWithFallbackEffect<ManagedUsageSnapshot>({
    source: readManagedDataSource(env),
    fixture: FIXTURE_USAGE,
    isLiveUseful: (u) => u.meta.orgId !== "fixture",
    live: Effect.gen(function* () {
      if (!orgId) {
        return yield* Effect.fail(new Error("CLAWQL_MANAGED_ORG_ID is required for live usage"));
      }
      const summary = yield* getOrgUnifiedSpendSummaryEffect({
        orgId,
        actorTenantId,
        includeWormSpend: true,
      });
      const spentFromWorm = summary.wormSpend?.totalUsd ?? 0;
      const creditsDollars = centsToDollars(summary.totalCreditsCents);
      const teamRows = summary.members.map((m) => {
        const spent = centsToDollars(Math.max(0, -Math.min(0, m.balanceCents)));
        // Show spendable as budget proxy until team budgets land.
        const budget = Math.max(centsToDollars(m.spendableCents) + spent, 1);
        return {
          team: m.displayName || m.email || m.memberTenantId,
          spent: spent || centsToDollars(Math.max(0, m.balanceCents === 0 ? 0 : 0)),
          budget,
          requests: 0,
          toolCalls: 0,
        };
      });
      // Prefer WORM spend when present; otherwise surface credit pool as "available" context.
      const monthSpent = spentFromWorm > 0 ? spentFromWorm : 0;
      return {
        monthSpent,
        monthBudget: Math.max(creditsDollars, monthSpent, 1),
        forecast: monthSpent > 0 ? Math.round(monthSpent * 2.5) : 0,
        forecastNote:
          spentFromWorm > 0
            ? "Forecast is a rough projection from WORM spend until daily metering lands."
            : "No WORM spend rows yet — showing credit balances by member.",
        todaySpent: 0,
        todayNote: "Daily spend series will appear when usage metering is connected.",
        planRenews: `${summary.displayName ?? summary.orgId} · credits live`,
        teamRows:
          teamRows.length > 0
            ? teamRows.map((row) => ({
                ...row,
                // Display spendable remaining as inverse of a soft budget bar.
                spent: centsToDollars(
                  summary.members.find(
                    (m) => (m.displayName || m.email || m.memberTenantId) === row.team,
                  )?.balanceCents ?? 0,
                ),
              }))
            : FIXTURE_USAGE.teamRows,
        daily: FIXTURE_USAGE.daily.map((d) => ({ ...d, amount: 0, today: d.today })),
        meta: {
          orgId: summary.orgId,
          totalCreditsCents: summary.totalCreditsCents,
          poolSpendableCents: summary.poolSpendableCents,
          memberCount: summary.members.length,
          generatedAt: summary.generatedAt,
        },
      } satisfies ManagedUsageSnapshot;
    }),
  }).pipe(Effect.map(({ data, source }) => ({ usage: data, source })));
};
