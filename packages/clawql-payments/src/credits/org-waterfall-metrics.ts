/**
 * In-process counters for org waterfall / overage (Prometheus text export).
 * Process-local — reset on restart; suitable for scrape-time gauges + counters.
 */

type OrgCounter = {
  memberCents: number;
  poolCents: number;
  overageCents: number;
  overageEvents: number;
  holds: number;
};

const byOrg = new Map<string, OrgCounter>();

function bucket(orgId: string): OrgCounter {
  const key = orgId.trim().toLowerCase();
  let b = byOrg.get(key);
  if (!b) {
    b = { memberCents: 0, poolCents: 0, overageCents: 0, overageEvents: 0, holds: 0 };
    byOrg.set(key, b);
  }
  return b;
}

export function recordOrgWaterfallSplit(
  orgId: string,
  memberCents: number,
  poolCents: number,
  overageCents: number
): void {
  const b = bucket(orgId);
  b.memberCents += memberCents;
  b.poolCents += poolCents;
  b.overageCents += overageCents;
  b.holds += 1;
}

export function recordOrgWaterfallOverage(orgId: string, overageCents: number): void {
  const b = bucket(orgId);
  b.overageEvents += 1;
  void overageCents;
}

export function resetOrgWaterfallMetricsForTests(): void {
  byOrg.clear();
}

export function snapshotOrgWaterfallMetrics(): Record<string, OrgCounter> {
  return Object.fromEntries([...byOrg.entries()]);
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Append waterfall counters to Prometheus text. */
export function renderOrgWaterfallPrometheus(): string {
  const lines: string[] = [
    "# HELP clawql_org_waterfall_hold_cents_total Credits held via org waterfall by source.",
    "# TYPE clawql_org_waterfall_hold_cents_total counter",
    "# HELP clawql_org_waterfall_overage_events_total Times spend exceeded member+pool credits.",
    "# TYPE clawql_org_waterfall_overage_events_total counter",
    "# HELP clawql_org_waterfall_holds_total Waterfall hold invocations.",
    "# TYPE clawql_org_waterfall_holds_total counter",
  ];
  for (const [orgId, b] of [...byOrg.entries()].sort(([a], [c]) => a.localeCompare(c))) {
    const o = escapeLabel(orgId);
    lines.push(
      `clawql_org_waterfall_hold_cents_total{org_id="${o}",source="member"} ${b.memberCents}`
    );
    lines.push(
      `clawql_org_waterfall_hold_cents_total{org_id="${o}",source="pool"} ${b.poolCents}`
    );
    lines.push(
      `clawql_org_waterfall_hold_cents_total{org_id="${o}",source="overage"} ${b.overageCents}`
    );
    lines.push(`clawql_org_waterfall_overage_events_total{org_id="${o}"} ${b.overageEvents}`);
    lines.push(`clawql_org_waterfall_holds_total{org_id="${o}"} ${b.holds}`);
  }
  return `${lines.join("\n")}\n`;
}
