/**
 * Harness-authored JavaScript a model would write for code-mode arms.
 * These scripts decide Cloudflare code-mode / Executor v2 code-token counts — keep minimal.
 *
 * Each export returns source text (not a function) for token counting + execute.
 *
 * Executor v2 QuickJS has no fetch / imports / filesystem (see Executor code-mode skill).
 * Live execute therefore uses the same static-upstream0 methodology as
 * gateway-multi-comparison: compact fixture slices are inlined; scripts filter in-process.
 * Label: `stdio_mcp_code_execute_static_upstream0`.
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

/**
 * Compact world slices for Executor static-upstream0 scripts.
 * @param {object} world fixture.world from recording
 */
export function compactExecutorPayloads(world) {
  const zone =
    world.zones.find((z) => z.name === FAKE.auditZoneName) || world.zones[0];
  const dns = world.dnsRecords
    .filter((r) => r.zone_id === zone.id)
    .map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      proxied: r.proxied,
    }));
  const workers = world.workers.map((w) => ({
    id: w.id,
    compatibility_date: w.compatibility_date || w.script_settings?.compatibility_date,
  }));
  const worker =
    workers.find((w) => w.id === FAKE.workerScriptName) || workers[0];
  const routes = world.routes.map((r) => ({
    pattern: r.pattern,
    script: r.script,
  }));
  const buckets = world.r2Buckets.map((b) => ({
    name: b.name,
    creation_date: b.creation_date,
  }));
  const firewall = world.firewallRules.map((r) => ({ paused: r.paused }));

  return {
    zones: world.zones.map((z) => ({
      id: z.id,
      name: z.name,
      status: z.status,
      plan: { name: z.plan?.name || z.plan_name },
    })),
    zoneDetail: {
      id: zone.id,
      status: zone.status,
      plan: { name: zone.plan?.name || zone.plan_name },
    },
    ssl: world.sslMode,
    dns,
    workers,
    workerSettings: { compatibility_date: worker.compatibility_date },
    routes,
    buckets,
    firewall,
  };
}

/**
 * Executor v2 execute({ code }) — static fixture slices (no fetch in sandbox).
 * Prefer `executorV2ScriptsFromWorld(world)`. `mockBase` overload kept for callers
 * that only need token estimates without a world (falls back to FAKE stubs).
 */
export function executorV2Scripts(mockBaseOrWorld) {
  if (mockBaseOrWorld && typeof mockBaseOrWorld === "object" && Array.isArray(mockBaseOrWorld.zones)) {
    return executorV2ScriptsFromWorld(mockBaseOrWorld);
  }
  // Token-estimate fallback without embedding the full DNS list.
  return executorV2ScriptsFromWorld({
    zones: [
      {
        id: FAKE.auditZoneId,
        name: FAKE.auditZoneName,
        status: "active",
        plan: { name: "Enterprise" },
      },
    ],
    dnsRecords: [
      {
        id: FAKE.unproxiedRecordId,
        zone_id: FAKE.auditZoneId,
        type: "A",
        name: FAKE.unproxiedRecordName,
        content: FAKE.targetIp,
        proxied: false,
      },
    ],
    workers: [{ id: FAKE.workerScriptName, compatibility_date: FAKE.workerCompatDate }],
    routes: [
      {
        pattern: `*${FAKE.auditZoneName}/*`,
        script: FAKE.workerScriptName,
      },
    ],
    r2Buckets: [{ name: "audit-assets", creation_date: "2024-01-01T00:00:00.000Z" }],
    firewallRules: [{ paused: false }, { paused: true }],
    sslMode: "full",
  });
}

export function executorV2ScriptsFromWorld(world) {
  const p = compactExecutorPayloads(world);
  const zoneName = JSON.stringify(FAKE.auditZoneName);
  const ip = JSON.stringify(FAKE.targetIp);
  const worker = JSON.stringify(FAKE.workerScriptName);
  const rec = JSON.stringify(FAKE.unproxiedRecordId);

  const zones = JSON.stringify(p.zones);
  const zoneDetail = JSON.stringify(p.zoneDetail);
  const ssl = JSON.stringify(p.ssl);
  const dns = JSON.stringify(p.dns);
  const workers = JSON.stringify(p.workers);
  const workerSettings = JSON.stringify(p.workerSettings);
  const routes = JSON.stringify(p.routes);
  const buckets = JSON.stringify(p.buckets);
  const firewall = JSON.stringify(p.firewall);

  return {
    1: `const j = { result: ${zones} };
const zone = j.result.find(z => z.name === ${zoneName});
return { zoneId: zone.id };`,
    2: `const j = { result: ${zoneDetail} };
return { status: j.result.status, planName: j.result.plan.name };`,
    3: `const j = { result: { value: ${ssl} } };
return { ssl: j.result.value };`,
    4: `const j = { result: ${dns} };
return { aRecordCount: j.result.filter(x => x.type === "A").length };`,
    5: `const j = { result: ${dns} };
return { names: j.result.filter(x => x.type === "A" && x.content === ${ip}).map(x => x.name) };`,
    6: `const j = { result: ${dns} };
return { unproxiedNames: j.result.filter(x => x.type === "A" && x.content === ${ip} && x.proxied === false).map(x => x.name) };`,
    7: `const j = { result: ${workers} };
return { scriptNames: j.result.map(x => x.id) };`,
    8: `const j = { result: ${workerSettings} };
return { compatibilityDate: j.result.compatibility_date };`,
    9: `const j = { result: ${routes} };
const route = j.result.find(x => x.script === ${worker});
return { routePattern: route.pattern, script: route.script };`,
    10: `const j = { result: { buckets: ${buckets} } };
return { buckets: j.result.buckets.map(b => ({ name: b.name, creation_date: b.creation_date })) };`,
    11: `const j = { result: ${firewall} };
return { enabledRuleCount: j.result.filter(x => x.paused === false).length };`,
    12: `return { proposal: { recordId: ${rec}, proxied: true }, gated: true };`,
  };
}
