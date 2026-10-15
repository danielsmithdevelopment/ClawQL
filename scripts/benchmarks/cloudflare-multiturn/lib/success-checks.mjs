/**
 * Scripted correct-answer checks for the 12-step zone audit.
 * Each step's expected value is derived from the fixture, not hard-coded magic.
 */

import { FAKE } from "./fixture-ids.mjs";

function asText(res) {
  if (res == null) return "";
  if (typeof res === "string") return res;
  try {
    return JSON.stringify(res);
  } catch {
    return String(res);
  }
}

/**
 * @param {object} fixture world model from generate-synthetic-fixture
 */
export function buildExpectations(fixture) {
  const zone = fixture.zones.find((z) => z.name === FAKE.auditZoneName) || fixture.zones[0];
  const dns = fixture.dnsRecords.filter((r) => r.zone_id === zone.id);
  const aAtIp = dns.filter((r) => r.type === "A" && r.content === FAKE.targetIp);
  const unproxied = aAtIp.filter((r) => r.proxied === false);
  const worker = fixture.workers.find((w) => w.id === FAKE.workerScriptName) || fixture.workers[0];
  const route = fixture.routes.find((r) => r.script === worker.id);
  const enabledFw = fixture.firewallRules.filter((r) => r.paused === false);

  return {
    1: { zoneId: zone.id },
    2: { status: zone.status, planName: zone.plan?.name || zone.plan_name },
    3: { ssl: fixture.sslMode },
    4: { aRecordCount: dns.filter((r) => r.type === "A").length },
    5: { names: aAtIp.map((r) => r.name).sort() },
    6: { unproxiedNames: unproxied.map((r) => r.name).sort() },
    7: { scriptNames: fixture.workers.map((w) => w.id).sort() },
    8: { compatibilityDate: worker.compatibility_date || worker.script_settings?.compatibility_date },
    9: { routePattern: route?.pattern, script: route?.script },
    10: {
      buckets: fixture.r2Buckets
        .map((b) => ({ name: b.name, creation_date: b.creation_date }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    11: { enabledRuleCount: enabledFw.length },
    12: {
      proposal: {
        recordId: FAKE.unproxiedRecordId,
        proxied: true,
      },
    },
  };
}

/**
 * @param {number} step 1..12
 * @param {unknown} observed agent/harness observation for that step
 * @param {ReturnType<typeof buildExpectations>} expectations
 */
export function checkStep(step, observed, expectations) {
  const exp = expectations[step];
  if (!exp) return { ok: false, reason: `unknown step ${step}` };

  switch (step) {
    case 1:
      return eq(observed?.zoneId ?? observed, exp.zoneId, "zoneId");
    case 2:
      return and([
        eq(observed?.status, exp.status, "status"),
        eq(observed?.planName ?? observed?.plan?.name, exp.planName, "planName"),
      ]);
    case 3:
      return eq(observed?.ssl ?? observed?.value ?? observed, exp.ssl, "ssl");
    case 4:
      return eq(Number(observed?.aRecordCount ?? observed), exp.aRecordCount, "aRecordCount");
    case 5:
      return eqArr(observed?.names ?? observed, exp.names, "names");
    case 6:
      return eqArr(observed?.unproxiedNames ?? observed, exp.unproxiedNames, "unproxiedNames");
    case 7:
      return eqArr(observed?.scriptNames ?? observed, exp.scriptNames, "scriptNames");
    case 8:
      return eq(
        observed?.compatibilityDate ?? observed,
        exp.compatibilityDate,
        "compatibilityDate"
      );
    case 9:
      return and([
        eq(observed?.routePattern ?? observed?.pattern, exp.routePattern, "routePattern"),
        eq(observed?.script, exp.script, "script"),
      ]);
    case 10:
      return eqArr(
        (observed?.buckets ?? observed)?.map?.((b) => `${b.name}|${b.creation_date}`) ?? observed,
        exp.buckets.map((b) => `${b.name}|${b.creation_date}`),
        "buckets"
      );
    case 11:
      return eq(Number(observed?.enabledRuleCount ?? observed), exp.enabledRuleCount, "enabledRuleCount");
    case 12: {
      const p = observed?.proposal ?? observed;
      return and([
        eq(p?.recordId ?? p?.id, exp.proposal.recordId, "recordId"),
        eq(p?.proxied, true, "proxied"),
      ]);
    }
    default:
      return { ok: false, reason: `unhandled step ${step}`, detail: asText(observed).slice(0, 200) };
  }
}

function eq(got, want, label) {
  const ok = got === want || String(got) === String(want);
  return ok
    ? { ok: true, label }
    : { ok: false, label, reason: `${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}` };
}

function eqArr(got, want, label) {
  const gRaw = Array.isArray(got) ? got : got == null ? [] : null;
  if (gRaw == null) {
    return {
      ok: false,
      label,
      reason: `${label}: got non-array ${JSON.stringify(got)?.slice?.(0, 120) ?? got}`,
    };
  }
  const g = [...gRaw].map(String).sort();
  const w = [...(want || [])].map(String).sort();
  const ok = g.length === w.length && g.every((x, i) => x === w[i]);
  return ok
    ? { ok: true, label }
    : { ok: false, label, reason: `${label}: got ${JSON.stringify(g)} want ${JSON.stringify(w)}` };
}

function and(parts) {
  const bad = parts.find((p) => !p.ok);
  return bad || { ok: true };
}
