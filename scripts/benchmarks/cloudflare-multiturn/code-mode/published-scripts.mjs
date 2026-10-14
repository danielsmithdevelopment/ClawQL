/**
 * Harness-authored JavaScript a model would write for code-mode arms.
 * These scripts decide Cloudflare code-mode / Executor v2 code-token counts — keep minimal.
 *
 * Each export returns source text (not a function) for token counting + execute.
 */
import { FAKE } from "../lib/fixture-ids.mjs";

/** Cloudflare API MCP / Executor-style: typed client assumed as `cf`. */
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

/** Executor v2 execute({ code }) — uses fetch against MOCK_BASE. */
export function executorV2Scripts(mockBase) {
  const base = JSON.stringify(mockBase.replace(/\/$/, ""));
  const acct = JSON.stringify(FAKE.accountId);
  const zone = JSON.stringify(FAKE.auditZoneId);
  const zoneName = JSON.stringify(FAKE.auditZoneName);
  const ip = JSON.stringify(FAKE.targetIp);
  const worker = JSON.stringify(FAKE.workerScriptName);
  const rec = JSON.stringify(FAKE.unproxiedRecordId);

  return {
    1: `const r = await fetch(${base} + "/zones"); const j = await r.json();
const zone = j.result.find(z => z.name === ${zoneName});
return { zoneId: zone.id };`,
    2: `const r = await fetch(${base} + "/zones/" + ${zone}); const j = await r.json();
return { status: j.result.status, planName: j.result.plan.name };`,
    3: `const r = await fetch(${base} + "/zones/" + ${zone} + "/settings/ssl"); const j = await r.json();
return { ssl: j.result.value };`,
    4: `const r = await fetch(${base} + "/zones/" + ${zone} + "/dns_records?per_page=500"); const j = await r.json();
return { aRecordCount: j.result.filter(x => x.type === "A").length };`,
    5: `const r = await fetch(${base} + "/zones/" + ${zone} + "/dns_records?per_page=500"); const j = await r.json();
return { names: j.result.filter(x => x.type === "A" && x.content === ${ip}).map(x => x.name) };`,
    6: `const r = await fetch(${base} + "/zones/" + ${zone} + "/dns_records?per_page=500"); const j = await r.json();
return { unproxiedNames: j.result.filter(x => x.type === "A" && x.content === ${ip} && x.proxied === false).map(x => x.name) };`,
    7: `const r = await fetch(${base} + "/accounts/" + ${acct} + "/workers/scripts"); const j = await r.json();
return { scriptNames: j.result.map(x => x.id) };`,
    8: `const r = await fetch(${base} + "/accounts/" + ${acct} + "/workers/scripts/" + ${worker} + "/settings"); const j = await r.json();
return { compatibilityDate: j.result.compatibility_date };`,
    9: `const r = await fetch(${base} + "/zones/" + ${zone} + "/workers/routes"); const j = await r.json();
const route = j.result.find(x => x.script === ${worker});
return { routePattern: route.pattern, script: route.script };`,
    10: `const r = await fetch(${base} + "/accounts/" + ${acct} + "/r2/buckets"); const j = await r.json();
return { buckets: j.result.buckets.map(b => ({ name: b.name, creation_date: b.creation_date })) };`,
    11: `const r = await fetch(${base} + "/zones/" + ${zone} + "/firewall/rules"); const j = await r.json();
return { enabledRuleCount: j.result.filter(x => x.paused === false).length };`,
    12: `return { proposal: { recordId: ${rec}, proxied: true }, gated: true };`,
  };
}
