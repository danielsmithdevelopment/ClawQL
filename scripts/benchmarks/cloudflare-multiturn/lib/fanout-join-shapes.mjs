/**
 * Fan-out / join board — six independent reads + a workers⋈routes join.
 * See docs/benchmarks/cloudflare-multiturn/fanout-join/SPEC.md
 */
import { FAKE } from "./fixture-ids.mjs";

const zone = FAKE.auditZoneId;
const acct = FAKE.accountId;

/**
 * Six parallel-friendly execute shapes (known ids — no discovery).
 * Call ids are stable for program plan + result matching.
 */
export const FANOUT_CALLS = Object.freeze([
  {
    id: "ssl",
    operationId: "zone-settings-get-single-setting",
    args: { zone_id: zone, setting_id: "ssl" },
    where: "{ssl: result.value}",
  },
  {
    id: "dns",
    operationId: "dns-records-for-a-zone-list-dns-records",
    args: { zone_id: zone, per_page: 500 },
    where: "{aRecordCount: length(result[?type==`A`])}",
  },
  {
    id: "workers",
    operationId: "worker-script-list-workers",
    args: { account_id: acct },
    where: "{workers: result[].id}",
  },
  {
    id: "routes",
    operationId: "worker-routes-list-routes",
    args: { zone_id: zone },
    where: "{routes: result[].{script: script, pattern: pattern}}",
  },
  {
    id: "r2",
    operationId: "r2-list-buckets",
    args: { account_id: acct },
    where: "{bucketNames: result.buckets[].name}",
  },
  {
    id: "fw",
    operationId: "firewall-rules-list-firewall-rules",
    args: { zone_id: zone },
    where: "{enabledFirewallRules: length(result[?paused==`false`])}",
  },
]);

/** Compact parallel plan for execute_program. */
export function buildFanoutJoinProgramPlan() {
  const calls = FANOUT_CALLS.map((c) => {
    const call = {
      id: c.id,
      operationId: c.operationId,
      where: c.where,
    };
    if (c.args && Object.keys(c.args).length > 0) call.args = c.args;
    return call;
  });
  return { v: 1, mode: "parallel", calls };
}

export function fanoutProgramPlanSource() {
  return JSON.stringify(buildFanoutJoinProgramPlan());
}

/** Model-written where/fields for a single known-op call (code-token bucket). */
export function fanoutModelWrittenCode(call) {
  return String(call.where || "");
}

/**
 * Join workers + routes into the inventory card fields that need both.
 * @param {{ workers?: string[], routes?: { script?: string, pattern?: string }[] }} parts
 */
export function joinRoutesForWorkers(parts) {
  const workers = [...(parts.workers || [])].map(String).sort();
  const set = new Set(workers);
  const routesForWorkers = [...(parts.routes || [])]
    .filter((r) => r && set.has(String(r.script)))
    .map((r) => ({ script: String(r.script), pattern: String(r.pattern) }))
    .sort((a, b) => a.script.localeCompare(b.script) || a.pattern.localeCompare(b.pattern));
  return { workers, routesForWorkers };
}

/**
 * Assemble the inventory card from per-call observation objects.
 * @param {Record<string, object>} byId keyed by FANOUT_CALLS id
 */
export function assembleInventoryCard(byId) {
  const ssl = byId.ssl?.ssl ?? byId.ssl?.value;
  const aRecordCount = Number(byId.dns?.aRecordCount);
  const { workers, routesForWorkers } = joinRoutesForWorkers({
    workers: byId.workers?.workers ?? byId.workers?.scriptNames,
    routes: byId.routes?.routes,
  });
  const bucketNames = [...(byId.r2?.bucketNames || [])].map(String).sort();
  const enabledFirewallRules = Number(byId.fw?.enabledFirewallRules);
  return {
    ssl,
    aRecordCount,
    workers,
    routesForWorkers,
    bucketNames,
    enabledFirewallRules,
  };
}
