/**
 * Observation-sized JMESPath `where` for ClawQL execute / execute_program.
 *
 * Honesty: this module only **builds tool arguments** a model would send
 * (`operationId`, `args`, `where`). Shaping runs **on the ClawQL server** via
 * product `execute.where` (JMESPath, including standard `length()`). The board
 * counts result tokens from MCP response text bytes — never client-side
 * post-processing of rows into counts/names.
 *
 * Shapes match code-mode program returns so Layer-2 tokens compare fairly (~357).
 */
import { FAKE } from "./fixture-ids.mjs";

/** Model-written shaping args (parallel to code-mode script tokens). */
export function modelWrittenShapeText(shape) {
  const parts = [];
  if (shape?.where) parts.push(String(shape.where));
  if (Array.isArray(shape?.fields) && shape.fields.length) {
    parts.push(JSON.stringify(shape.fields));
  }
  return parts.join("\n");
}

const zone = FAKE.auditZoneName;
const ip = FAKE.targetIp;
const worker = FAKE.workerScriptName;

/**
 * Per-step execute shaping for the 12-step zone audit (steps 1–11).
 * Step 12 is a gated proposal (no provider call).
 */
export const CLAWQL_STEP_SHAPES = Object.freeze({
  1: {
    operationId: "zones-get",
    args: {},
    query: "list zones",
    where: `{zoneId: result[?name==\`${zone}\`].id | [0]}`,
  },
  2: {
    operationId: "zones-0-get",
    args: { zone_id: FAKE.auditZoneId },
    query: "get zone details",
    where: "result.{status: status, planName: plan.name}",
  },
  3: {
    operationId: "zone-settings-get-single-setting",
    args: { zone_id: FAKE.auditZoneId, setting_id: "ssl" },
    query: "ssl tls mode setting",
    where: "{ssl: result.value}",
  },
  4: {
    operationId: "dns-records-for-a-zone-list-dns-records",
    args: { zone_id: FAKE.auditZoneId, per_page: 500 },
    query: "list dns records",
    where: "{aRecordCount: length(result[?type==`A`])}",
  },
  5: {
    operationId: "dns-records-for-a-zone-list-dns-records",
    args: { zone_id: FAKE.auditZoneId, per_page: 500 },
    query: "list dns records",
    where: `{names: result[?type==\`A\` && content==\`${ip}\`].name}`,
  },
  6: {
    operationId: "dns-records-for-a-zone-list-dns-records",
    args: { zone_id: FAKE.auditZoneId, per_page: 500 },
    query: "list dns records",
    where: `{unproxiedNames: result[?type==\`A\` && content==\`${ip}\` && proxied==\`false\`].name}`,
  },
  7: {
    operationId: "worker-script-list-workers",
    args: { account_id: FAKE.accountId },
    query: "list workers scripts",
    where: "{scriptNames: result[].id}",
  },
  8: {
    operationId: "worker-script-get-settings",
    args: { account_id: FAKE.accountId, script_name: worker },
    query: "worker script settings compatibility",
    where: "{compatibilityDate: result.compatibility_date}",
  },
  9: {
    operationId: "worker-routes-list-routes",
    args: { zone_id: FAKE.auditZoneId },
    query: "worker routes",
    where: `result[?script==\`${worker}\`] | [0].{routePattern: pattern, script: script}`,
  },
  10: {
    operationId: "r2-list-buckets",
    args: { account_id: FAKE.accountId },
    query: "list r2 buckets",
    where: "{buckets: result.buckets[].{name: name, creation_date: creation_date}}",
  },
  11: {
    operationId: "firewall-rules-list-firewall-rules",
    args: { zone_id: FAKE.auditZoneId },
    query: "firewall rules",
    where: "{enabledRuleCount: length(result[?paused==`false`])}",
  },
});

/**
 * Compact JSON plan for execute_program (ADR 0015 v0).
 * Omits tool (defaults to execute when operationId is set), omits empty args,
 * uses short ids. Reads only — step 12 stays a harness-gated proposal.
 */
export function buildZoneAuditProgramPlan() {
  const calls = [];
  for (let step = 1; step <= 11; step++) {
    const s = CLAWQL_STEP_SHAPES[step];
    const call = {
      id: String(step),
      operationId: s.operationId,
      where: s.where,
    };
    if (s.args && Object.keys(s.args).length > 0) {
      call.args = s.args;
    }
    calls.push(call);
  }
  return { v: 1, mode: "sequential", calls };
}

export function programPlanSource() {
  return JSON.stringify(buildZoneAuditProgramPlan());
}

/** Id used in compact plans for step N (1–11). */
export function programCallId(step) {
  return String(step);
}
