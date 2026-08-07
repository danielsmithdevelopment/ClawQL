/**
 * Prometheus text exposition for org credit balances (enterprise observability).
 */

import { getOrgUnifiedSpendSummary, type OrgUnifiedSpendSummary } from "./org-spend.js";
import { loadOrgCreditsFile } from "./org.js";
import { renderOrgWaterfallPrometheus } from "./org-waterfall-metrics.js";

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Render Prometheus gauges for one org spend summary. */
export function renderOrgSpendPrometheus(summary: OrgUnifiedSpendSummary): string {
  const lines: string[] = [
    "# HELP clawql_org_pool_balance_cents Company credit pool balance (USD cents).",
    "# TYPE clawql_org_pool_balance_cents gauge",
    `clawql_org_pool_balance_cents{org_id="${escapeLabel(summary.orgId)}"} ${summary.poolBalanceCents}`,
    "# HELP clawql_org_member_balance_cents Sum of member credit balances (USD cents).",
    "# TYPE clawql_org_member_balance_cents gauge",
    `clawql_org_member_balance_cents{org_id="${escapeLabel(summary.orgId)}"} ${summary.memberBalanceCents}`,
    "# HELP clawql_org_total_credits_cents Pool + member credits (USD cents).",
    "# TYPE clawql_org_total_credits_cents gauge",
    `clawql_org_total_credits_cents{org_id="${escapeLabel(summary.orgId)}"} ${summary.totalCreditsCents}`,
    "# HELP clawql_org_member_count Active/suspended/left membership rows.",
    "# TYPE clawql_org_member_count gauge",
  ];

  const byStatus = new Map<string, number>();
  for (const m of summary.members) {
    byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
  }
  for (const status of ["active", "suspended", "left"] as const) {
    lines.push(
      `clawql_org_member_count{org_id="${escapeLabel(summary.orgId)}",status="${status}"} ${byStatus.get(status) ?? 0}`
    );
  }

  lines.push(
    "# HELP clawql_org_member_balance_cents_by_tenant Per-member credit balance (USD cents).",
    "# TYPE clawql_org_member_balance_cents_by_tenant gauge"
  );
  for (const m of summary.members) {
    lines.push(
      `clawql_org_member_balance_cents_by_tenant{org_id="${escapeLabel(summary.orgId)}",tenant_id="${escapeLabel(m.memberTenantId)}",status="${m.status}"} ${m.balanceCents}`
    );
  }

  return `${lines.join("\n")}\n`;
}

/** Load all orgs and emit combined Prometheus text (balances + waterfall counters). */
export async function renderAllOrgCreditsPrometheus(
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const file = await loadOrgCreditsFile(env);
  const chunks: string[] = [];
  for (const orgId of Object.keys(file.orgs).sort()) {
    const summary = await getOrgUnifiedSpendSummary({ orgId }, env);
    chunks.push(renderOrgSpendPrometheus(summary));
  }
  chunks.push(renderOrgWaterfallPrometheus());
  return chunks.join("\n");
}
