import { Context, Data, Effect, Layer } from "effect";
import type { PaymentProvider, PaymentWormEntry } from "./events.js";
import { listPaymentAuditEntries } from "./worm.js";

export type SpendGroupBy = "provider" | "tenant" | "plan";

export type SpendReportRow = {
  group: string;
  provider: PaymentProvider;
  count: number;
  amountUsd: number;
  amountUsdc: number;
};

export type SpendReport = {
  rows: SpendReportRow[];
  totalUsd: number;
  totalUsdc: number;
};

export function buildSpendReport(
  entries: PaymentWormEntry[],
  groupBy: SpendGroupBy = "provider"
): SpendReport {
  const buckets = new Map<string, SpendReportRow>();

  for (const entry of entries) {
    const provider = entry.payload.provider;
    const group =
      groupBy === "provider"
        ? provider
        : groupBy === "tenant"
          ? entry.payload.tenant_id
          : (entry.payload.plan ?? "unknown");

    const key = `${provider}:${group}`;
    const row =
      buckets.get(key) ??
      ({
        group,
        provider,
        count: 0,
        amountUsd: 0,
        amountUsdc: 0,
      } satisfies SpendReportRow);

    row.count += 1;
    row.amountUsd += entry.payload.amount_usd ?? 0;
    row.amountUsdc += entry.payload.amount_usdc ?? 0;
    buckets.set(key, row);
  }

  const rows = [...buckets.values()].sort((a, b) => a.group.localeCompare(b.group));
  return {
    rows,
    totalUsd: rows.reduce((sum, r) => sum + r.amountUsd, 0),
    totalUsdc: rows.reduce((sum, r) => sum + r.amountUsdc, 0),
  };
}

/** @deprecated Prefer PaymentAuditReconcileService.spendReport — Promise façade retained for legacy callers. */
export async function loadSpendReport(
  groupBy: SpendGroupBy = "provider",
  limit = 10_000
): Promise<SpendReport> {
  const entries = await listPaymentAuditEntries(limit);
  return buildSpendReport(entries, groupBy);
}

export function filterAuditByCorrelationId(
  correlationId: string,
  entries: PaymentWormEntry[]
): PaymentWormEntry[] {
  return entries.filter((e) => e.correlationId === correlationId);
}

/** @deprecated Prefer PaymentAuditReconcileService.byCorrelationId — Promise façade retained for legacy callers. */
export async function loadAuditByCorrelationId(
  correlationId: string,
  limit = 10_000
): Promise<PaymentWormEntry[]> {
  const entries = await listPaymentAuditEntries(limit);
  return filterAuditByCorrelationId(correlationId, entries);
}

export class PaymentAuditReconcileError extends Data.TaggedError("PaymentAuditReconcileError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Effect surface over payment audit reconciliation (spend rollups + correlation lookups). */
export class PaymentAuditReconcileService extends Context.Tag(
  "clawql/PaymentAuditReconcileService"
)<
  PaymentAuditReconcileService,
  {
    readonly spendReport: (
      groupBy?: SpendGroupBy,
      limit?: number
    ) => Effect.Effect<SpendReport, PaymentAuditReconcileError>;
    readonly byCorrelationId: (
      correlationId: string,
      limit?: number
    ) => Effect.Effect<PaymentWormEntry[], PaymentAuditReconcileError>;
  }
>() {}

export function paymentAuditReconcileLiveLayer(): Layer.Layer<PaymentAuditReconcileService> {
  const run = <A>(reason: string, task: () => Promise<A>) =>
    Effect.tryPromise({
      try: task,
      catch: (cause) =>
        cause instanceof PaymentAuditReconcileError
          ? cause
          : new PaymentAuditReconcileError({
              reason: cause instanceof Error ? cause.message : reason,
              cause,
            }),
    });

  return Layer.succeed(
    PaymentAuditReconcileService,
    PaymentAuditReconcileService.of({
      spendReport: (groupBy = "provider", limit = 10_000) =>
        run("Failed to build spend report", () => loadSpendReport(groupBy, limit)),
      byCorrelationId: (correlationId, limit = 10_000) =>
        run("Failed to load audit by correlation id", () =>
          loadAuditByCorrelationId(correlationId, limit)
        ),
    })
  );
}
