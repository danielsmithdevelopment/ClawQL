/**
 * Success checks for the fan-out / join inventory card.
 */
import { FAKE } from "./fixture-ids.mjs";
import { assembleInventoryCard, joinRoutesForWorkers } from "./fanout-join-shapes.mjs";

/**
 * @param {object} fixture world model from recording / synthetic fixture
 */
export function buildFanoutExpectations(fixture) {
  const zone = fixture.zones.find((z) => z.name === FAKE.auditZoneName) || fixture.zones[0];
  const dns = fixture.dnsRecords.filter((r) => r.zone_id === zone.id);
  const workers = fixture.workers.map((w) => w.id).sort();
  const { routesForWorkers } = joinRoutesForWorkers({
    workers,
    routes: fixture.routes.map((r) => ({ script: r.script, pattern: r.pattern })),
  });
  const bucketNames = fixture.r2Buckets.map((b) => b.name).sort();
  const enabledFirewallRules = fixture.firewallRules.filter((r) => r.paused === false).length;

  return {
    ssl: fixture.sslMode,
    aRecordCount: dns.filter((r) => r.type === "A").length,
    workers,
    routesForWorkers,
    bucketNames,
    enabledFirewallRules,
  };
}

function eq(a, b, field) {
  if (Object.is(a, b) || a === b) return { ok: true };
  return { ok: false, reason: `${field}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}` };
}

function eqArr(a, b, field) {
  const aa = [...(a || [])].map(String).sort();
  const bb = [...(b || [])].map(String).sort();
  if (aa.length !== bb.length) {
    return { ok: false, reason: `${field}: length ${aa.length} vs ${bb.length}` };
  }
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) {
      return { ok: false, reason: `${field}[${i}]: ${aa[i]} vs ${bb[i]}` };
    }
  }
  return { ok: true };
}

function eqRoutes(a, b) {
  const norm = (rows) =>
    [...(rows || [])]
      .map((r) => `${r.script}\0${r.pattern}`)
      .sort();
  const aa = norm(a);
  const bb = norm(b);
  if (aa.length !== bb.length) {
    return { ok: false, reason: `routesForWorkers: length ${aa.length} vs ${bb.length}` };
  }
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) {
      return { ok: false, reason: `routesForWorkers[${i}] mismatch` };
    }
  }
  return { ok: true };
}

/**
 * @param {object} card inventory card (or raw byId map — will assemble)
 * @param {ReturnType<typeof buildFanoutExpectations>} exp
 */
export function checkInventoryCard(card, exp) {
  const c =
    card && card.ssl != null && card.workers
      ? card
      : assembleInventoryCard(card || {});
  const checks = [
    eq(c.ssl, exp.ssl, "ssl"),
    eq(Number(c.aRecordCount), exp.aRecordCount, "aRecordCount"),
    eqArr(c.workers, exp.workers, "workers"),
    eqRoutes(c.routesForWorkers, exp.routesForWorkers),
    eqArr(c.bucketNames, exp.bucketNames, "bucketNames"),
    eq(Number(c.enabledFirewallRules), exp.enabledFirewallRules, "enabledFirewallRules"),
  ];
  const bad = checks.find((x) => !x.ok);
  return bad || { ok: true };
}
