import { loadPaymentsConfig, mergePaymentsConfig } from "../config/store.js";
import {
  appendPaymentWormEntry,
  buildPlanChangedEntry,
  buildSpendReport,
  filterAuditByCorrelationId,
  listPaymentAuditEntries,
  verifyPaymentAuditLog,
  type SpendGroupBy,
} from "../audit/index.js";
import {
  CLAWQL_PLANS,
  createUsageStore,
  entitlementsFromPlan,
  isClawqlPlanId,
  type ClawqlPlanId,
} from "../plans/index.js";

export type PaymentsPlanShowOptions = {
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsPlanShow(options: PaymentsPlanShowOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const entitlements = entitlementsFromPlan(config.plan);
  const usage = await createUsageStore(env).getUsage(config.tenantId ?? "default");

  const payload = {
    plan: config.plan,
    entitlements,
    usage,
    tiers: CLAWQL_PLANS,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(`Current plan: ${config.plan}`);
  console.log(
    `Entitlements: ${entitlements.inferenceCallsPerMonth} inference/mo, ${entitlements.documentsPerMonth} docs/mo, x402=${entitlements.x402Enabled}`
  );
  console.log(
    `Usage (${usage.month}): ${usage.inferenceCalls} inference calls, ${usage.documents} documents`
  );
  return 0;
}

export type PaymentsPlanUpgradeOptions = {
  tier?: string;
  tenantId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsPlanUpgrade(
  options: PaymentsPlanUpgradeOptions = {}
): Promise<number> {
  if (!options.tier?.trim() || !isClawqlPlanId(options.tier)) {
    console.error("Usage: clawql payments plan upgrade --tier free|pro|team|enterprise");
    return 1;
  }

  const env = options.env ?? process.env;
  const current = await loadPaymentsConfig(env);
  const toPlan = options.tier as ClawqlPlanId;
  const tenantId = options.tenantId ?? current.tenantId ?? "default";

  const { config, path } = await mergePaymentsConfig({ plan: toPlan, tenantId }, env);

  appendPaymentWormEntry(
    buildPlanChangedEntry({
      tenantId,
      fromPlan: current.plan,
      toPlan,
      upgraded:
        ["free", "pro", "team", "enterprise"].indexOf(toPlan) >
        ["free", "pro", "team", "enterprise"].indexOf(current.plan),
    })
  );

  if (options.json) {
    console.log(JSON.stringify({ plan: config.plan, tenantId: config.tenantId, path }, null, 2));
    return 0;
  }

  console.log(`Plan upgraded ${current.plan} → ${config.plan} (tenant ${tenantId})`);
  console.log(`Saved to ${path}`);
  return 0;
}

export type PaymentsUsageReportOptions = {
  month?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsUsageReport(
  options: PaymentsUsageReportOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const usage = await createUsageStore(env).getUsage(config.tenantId ?? "default", options.month);

  if (options.json) {
    console.log(JSON.stringify(usage, null, 2));
    return 0;
  }

  console.log(`Usage for ${usage.tenantId} (${usage.month}) on plan ${usage.planId}`);
  console.log(`  inference calls: ${usage.inferenceCalls}`);
  console.log(`  documents:       ${usage.documents}`);
  console.log(`  memory peak MB:  ${usage.memoryMbPeak}`);
  return 0;
}

export type PaymentsSpendReportOptions = {
  groupBy?: SpendGroupBy;
  json?: boolean;
};

export async function runPaymentsSpendReport(
  options: PaymentsSpendReportOptions = {}
): Promise<number> {
  const report = buildSpendReport(listPaymentAuditEntries(10_000), options.groupBy ?? "provider");

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  console.log(`Spend report (group by ${options.groupBy ?? "provider"})`);
  for (const row of report.rows) {
    console.log(
      `  ${row.group} [${row.provider}]: ${row.count} events, $${row.amountUsd.toFixed(2)} USD, ${row.amountUsdc} USDC`
    );
  }
  console.log(`Total: $${report.totalUsd.toFixed(2)} USD, ${report.totalUsdc} USDC`);
  return 0;
}

export type PaymentsAuditOptions = {
  correlationId?: string;
  limit?: number;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

export async function runPaymentsAudit(options: PaymentsAuditOptions = {}): Promise<number> {
  const entries = options.correlationId
    ? filterAuditByCorrelationId(options.correlationId)
    : listPaymentAuditEntries(options.limit ?? 100);

  if (options.json) {
    console.log(JSON.stringify({ entries }, null, 2));
    return 0;
  }

  if (entries.length === 0) {
    console.log("No payment audit entries found.");
    return 0;
  }

  for (const entry of entries) {
    const corr = entry.correlationId ? ` corr=${entry.correlationId}` : "";
    console.log(`${entry.ts} ${entry.action}${corr}: ${entry.summary}`);
  }
  return 0;
}

export async function runPaymentsAuditVerify(
  options: PaymentsAuditOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  const result = verifyPaymentAuditLog(env);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  if (result.ok) {
    console.log(
      `Payment audit chain OK — ${result.records} record(s), head=${result.head_hash.slice(0, 16)}…`
    );
    return 0;
  }

  console.error(`Payment audit chain FAILED — ${result.issues.length} issue(s)`);
  for (const issue of result.issues.slice(0, 20)) {
    console.error(`  seq ${issue.seq}: ${issue.reason}`);
  }
  if (result.issues.length > 20) {
    console.error(`  … and ${result.issues.length - 20} more`);
  }
  return 1;
}
