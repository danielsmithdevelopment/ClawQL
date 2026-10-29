/**
 * Harness-authored JavaScript a model would write for code-mode arms.
 * These scripts decide Cloudflare code-mode / Executor v2 code-token counts — keep minimal.
 *
 * Executor v2: call tools on the deployed OpenAPI app (`cf-zone-audit-mock`) that
 * fronts the replay mock. The Executor host performs HTTP; QuickJS never uses fetch.
 */
import { FAKE } from "../lib/fixture-ids.mjs";

/** Cloudflare API MCP / typed-client style scripts (tokens + tokens-only result sizes). */
export const CLOUDFLARE_CODE_MODE = {
  1: `const zones = await cf.zones.list();
const zone = zones.result.find(z => z.name === ${JSON.stringify(FAKE.auditZoneName)});
return { zoneId: zone.id };`,

  2: `const z = await cf.zones.get({ zone_id: ZONE_ID });
return { status: z.result.status, planName: z.result.plan.name };`,

  3: `const s = await cf.zones.settings.get({ zone_id: ZONE_ID, setting_id: "ssl" });
return { ssl: s.result.value };`,

  4: `const dns = await cf.dns.records.list({ zone_id: ZONE_ID, per_page: 500 });
return { aRecordCount: dns.result.filter(r => r.type === "A").length };`,

  5: `const dns = await cf.dns.records.list({ zone_id: ZONE_ID, per_page: 500 });
const names = dns.result.filter(r => r.type === "A" && r.content === ${JSON.stringify(FAKE.targetIp)}).map(r => r.name);
return { names };`,

  6: `const dns = await cf.dns.records.list({ zone_id: ZONE_ID, per_page: 500 });
const unproxiedNames = dns.result
  .filter(r => r.type === "A" && r.content === ${JSON.stringify(FAKE.targetIp)} && r.proxied === false)
  .map(r => r.name);
return { unproxiedNames };`,

  7: `const scripts = await cf.workers.scripts.list({ account_id: ACCOUNT_ID });
return { scriptNames: scripts.result.map(s => s.id) };`,

  8: `const settings = await cf.workers.scripts.settings.get({
  account_id: ACCOUNT_ID,
  script_name: ${JSON.stringify(FAKE.workerScriptName)},
});
return { compatibilityDate: settings.result.compatibility_date };`,

  9: `const routes = await cf.workers.routes.list({ zone_id: ZONE_ID });
const route = routes.result.find(r => r.script === ${JSON.stringify(FAKE.workerScriptName)});
return { routePattern: route.pattern, script: route.script };`,

  10: `const buckets = await cf.r2.buckets.list({ account_id: ACCOUNT_ID });
return { buckets: buckets.result.buckets.map(b => ({ name: b.name, creation_date: b.creation_date })) };`,

  11: `const rules = await cf.firewall.rules.list({ zone_id: ZONE_ID });
return { enabledRuleCount: rules.result.filter(r => r.paused === false).length };`,

  12: `// Proposal only — do not PATCH. Return gated proposal for the harness.
return {
  proposal: { recordId: ${JSON.stringify(FAKE.unproxiedRecordId)}, proxied: true },
  gated: true,
};`,
};

/** Documented Cloudflare code-mode Layer-1 (~2 tools) — see SPEC / CF docs. */
export const CLOUDFLARE_CODEMODE_DEFINITION_TOKENS = 1000;

const DEFAULT_APP_SLUG = "cf-zone-audit-mock";

/**
 * Executor v2 scripts that call liveOpenapiRouter tools on the mock-backed app.
 * @param {{ appSlug?: string }} [opts]
 */
export function executorV2ToolScripts(opts = {}) {
  const slug = opts.appSlug || process.env.EXECUTOR_CF_APP_SLUG || DEFAULT_APP_SLUG;
  const A = `tools[${JSON.stringify(slug)}]`;
  const zone = JSON.stringify(FAKE.auditZoneId);
  const acct = JSON.stringify(FAKE.accountId);
  const zoneName = JSON.stringify(FAKE.auditZoneName);
  const ip = JSON.stringify(FAKE.targetIp);
  const worker = JSON.stringify(FAKE.workerScriptName);
  const rec = JSON.stringify(FAKE.unproxiedRecordId);

  return {
    1: `const j = await ${A}.zone.zonesGet({});
const zone = j.result.find(z => z.name === ${zoneName});
return { zoneId: zone.id };`,
    2: `const j = await ${A}.zone.zones0Get({ path: { zone_id: ${zone} } });
return { status: j.result.status, planName: j.result.plan.name };`,
    3: `const j = await ${A}.zoneSettings.zoneSettingsGetSingleSetting({ path: { zone_id: ${zone}, setting_id: "ssl" } });
return { ssl: j.result.value };`,
    4: `const j = await ${A}.dnsRecordsForAZone.dnsRecordsForAZoneListDnsRecords({ path: { zone_id: ${zone} } });
return { aRecordCount: j.result.filter(r => r.type === "A").length };`,
    5: `const j = await ${A}.dnsRecordsForAZone.dnsRecordsForAZoneListDnsRecords({ path: { zone_id: ${zone} } });
return { names: j.result.filter(r => r.type === "A" && r.content === ${ip}).map(r => r.name) };`,
    6: `const j = await ${A}.dnsRecordsForAZone.dnsRecordsForAZoneListDnsRecords({ path: { zone_id: ${zone} } });
return { unproxiedNames: j.result.filter(r => r.type === "A" && r.content === ${ip} && r.proxied === false).map(r => r.name) };`,
    7: `const j = await ${A}.workerScript.workerScriptListWorkers({ path: { account_id: ${acct} } });
return { scriptNames: j.result.map(s => s.id) };`,
    8: `const j = await ${A}.workerScript.workerScriptGetSettings({ path: { account_id: ${acct}, script_name: ${worker} } });
return { compatibilityDate: j.result.compatibility_date };`,
    9: `const j = await ${A}.workerRoutes.workerRoutesListRoutes({ path: { zone_id: ${zone} } });
const route = j.result.find(r => r.script === ${worker});
return { routePattern: route.pattern, script: route.script };`,
    10: `const j = await ${A}.r2Bucket.r2ListBuckets({ path: { account_id: ${acct} } });
return { buckets: j.result.buckets.map(b => ({ name: b.name, creation_date: b.creation_date })) };`,
    11: `const j = await ${A}.firewallRules.firewallRulesListFirewallRules({ path: { zone_id: ${zone} } });
return { enabledRuleCount: j.result.filter(r => r.paused === false).length };`,
    12: `return { proposal: { recordId: ${rec}, proxied: true }, gated: true };`,
  };
}

/** @deprecated Use executorV2ToolScripts — kept so smoke token estimates still import. */
export function executorV2Scripts() {
  return executorV2ToolScripts();
}

/** @deprecated removed static_upstream0 path */
export function executorV2ScriptsFromWorld() {
  return executorV2ToolScripts();
}
