#!/usr/bin/env node
/**
 * Audit same-host supersede lines from celld soak / board logs.
 *
 * Lab emits (pre-TTL only):
 *   same-host supersede: fencing predecessor whose host_process is provably dead
 *
 * Enriched dual-sided lines also carry:
 *   lease_pid / lease_process_start_ticks / lease_boot_id
 *   observed_boot_id / boot_id_matches / pid_dir_exists
 *   observed_process_start_ticks / start_ticks_match / dead_reason
 *
 * Pre-enrichment Mac mini authorizing soak logs have only dead= + expires_in_ms.
 * That audit is **count_and_flag_only** (not a pass): it cannot prove the
 * process was gone, only that the decision was logged.
 *
 * Usage:
 *   node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
 *     /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
 *     [--out report.json] [--expect 2117]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const files = [];
let outPath = null;
let expectCount = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") {
    outPath = args[++i];
    continue;
  }
  if (args[i] === "--expect") {
    expectCount = Number(args[++i]);
    continue;
  }
  files.push(args[i]);
}

if (!files.length) {
  console.error(
    "usage: audit-soak-supersedes.mjs <log> [log...] [--out report.json] [--expect N]"
  );
  process.exit(2);
}

const MSG =
  "same-host supersede: fencing predecessor whose host_process is provably dead";

const DEAD_REASONS_OK = new Set(["pid_absent", "start_ticks_mismatch"]);

function parseFields(line) {
  const fields = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s]+))/g;
  let m;
  while ((m = re.exec(line))) {
    fields[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return fields;
}

function parseBoolish(v) {
  if (v === undefined || v === null || v === "" || v === "null" || v === "none") {
    return null;
  }
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return null;
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const events = [];
const byFile = {};

for (const file of files) {
  const text = readFileSync(file, "utf8");
  byFile[file] = { lines: 0, supersedes: 0 };
  for (const line of text.split(/\r?\n/)) {
    byFile[file].lines += 1;
    if (!line.includes(MSG)) continue;
    byFile[file].supersedes += 1;
    const f = parseFields(line);
    const expiresInMs = Number(f.expires_in_ms);

    // Prefer dual-sided lease_* names; accept legacy pid=/boot_id= briefly.
    const leasePidRaw = f.lease_pid ?? f.pid;
    const leaseTicks = f.lease_process_start_ticks ?? f.process_start_ticks ?? null;
    const leaseBoot = f.lease_boot_id ?? f.boot_id ?? null;
    const leasePid =
      leasePidRaw === undefined || leasePidRaw === "null" || leasePidRaw === ""
        ? null
        : Number(leasePidRaw);

    const observedBoot = f.observed_boot_id || null;
    const bootIdMatches = parseBoolish(f.boot_id_matches);
    const pidDirExists = parseBoolish(f.pid_dir_exists);
    const observedTicks = f.observed_process_start_ticks || null;
    const startTicksMatch = parseBoolish(f.start_ticks_match);
    const deadReason = f.dead_reason || null;

    const hasLeaseStamp =
      leasePid !== null &&
      Number.isFinite(leasePid) &&
      leasePid > 0 &&
      typeof leaseTicks === "string" &&
      leaseTicks.length > 0 &&
      typeof leaseBoot === "string" &&
      leaseBoot.length > 0;

    const hasLocalObservation =
      deadReason != null &&
      deadReason.length > 0 &&
      bootIdMatches !== null &&
      pidDirExists !== null &&
      typeof observedBoot === "string" &&
      observedBoot.length > 0;

    const dualSided = hasLeaseStamp && hasLocalObservation;

    let comparisonOk = false;
    let comparisonFail = null;
    if (dualSided) {
      if (!bootIdMatches) {
        comparisonFail = "boot_id_matches_false";
      } else if (!DEAD_REASONS_OK.has(deadReason)) {
        comparisonFail = `dead_reason_not_ok:${deadReason}`;
      } else if (deadReason === "pid_absent" && pidDirExists !== false) {
        comparisonFail = "pid_absent_but_dir_exists";
      } else if (
        deadReason === "start_ticks_mismatch" &&
        (pidDirExists !== true || startTicksMatch !== false)
      ) {
        comparisonFail = "start_ticks_mismatch_inconsistent";
      } else {
        comparisonOk = true;
      }
    }

    events.push({
      file,
      dead: f.dead || null,
      expiresInMs: Number.isFinite(expiresInMs) ? expiresInMs : null,
      leasePid,
      leaseProcessStartTicks: leaseTicks,
      leaseBootId: leaseBoot,
      observedBootId: observedBoot,
      bootIdMatches,
      pidDirExists,
      observedProcessStartTicks: observedTicks,
      startTicksMatch,
      deadReason,
      hasLeaseStamp,
      hasLocalObservation,
      dualSided,
      comparisonOk,
      comparisonFail,
      preTtl: Number.isFinite(expiresInMs) && expiresInMs > 0,
      line: line.slice(0, 800),
    });
  }
}

const dual = events.filter((e) => e.dualSided);
const leaseOnly = events.filter((e) => e.hasLeaseStamp && !e.hasLocalObservation);
const bare = events.filter((e) => !e.hasLeaseStamp);
const comparisonFails = dual.filter((e) => !e.comparisonOk);
const notPreTtl = events.filter((e) => !e.preTtl);
const uniqueDead = new Set(events.map((e) => e.dead).filter(Boolean));
const expectOk = expectCount == null ? null : events.length === expectCount;

let status;
let ok;
if (events.length === 0) {
  status = "no_supersede_lines";
  ok = false;
} else if (notPreTtl.length) {
  status = "failed_non_pre_ttl";
  ok = false;
} else if (expectCount != null && !expectOk) {
  status = "failed_expect_count";
  ok = false;
} else if (dual.length === events.length && comparisonFails.length === 0) {
  status = "pass_process_evidence";
  ok = true;
} else if (dual.length === events.length && comparisonFails.length > 0) {
  status = "failed_comparison";
  ok = false;
} else if (bare.length === events.length) {
  // Pre-enrichment authorizing soak: count + flag only — NOT a pass.
  status = "count_and_flag_only";
  ok = false;
} else {
  status = "failed_incomplete_evidence_fields";
  ok = false;
}

const report = {
  kind: "celld-same-host-supersede-audit",
  auditedAt: new Date().toISOString(),
  auditorGitCommit: gitHead(),
  authorizingSoakGitCommit: "112a8aa6ecb2d11053cca10118c8eb4e718d0a78",
  logs: byFile,
  totals: {
    supersedes: events.length,
    dualSided: dual.length,
    leaseStampOnly: leaseOnly.length,
    bareDecisionOnly: bare.length,
    comparisonOk: dual.filter((e) => e.comparisonOk).length,
    comparisonFail: comparisonFails.length,
    preTtl: events.filter((e) => e.preTtl).length,
    notPreTtl: notPreTtl.length,
    uniqueDeadSessions: uniqueDead.size,
  },
  expectCount,
  expectOk,
  honesty: {
    count_and_flag_only:
      "Pre-enrichment logs show the supersede *decision* (dead= session key + expires_in_ms) but not the process evidence or local /proc observation. This status confirms count and that every line is the same-host pre-TTL message — it does **not** prove the predecessor process was gone. Not a pass.",
    pass_process_evidence:
      "Every supersede line carries lease stamp + local observation; dead_reason is pid_absent or start_ticks_mismatch; boot_id matched; comparison fields are internally consistent.",
    buildChain:
      "Authorizing soak measured_v4_ready was commit 112a8aa6e (pre-enrichment lab). Dual-sided proof soaks/boards run on a later enriched lab commit — record celldLabGitCommit in evidence.",
  },
  ok,
  status,
  sampleBare: bare.slice(0, 2).map((e) => e.line),
  sampleDualOk: dual
    .filter((e) => e.comparisonOk)
    .slice(0, 3)
    .map((e) => ({
      dead: e.dead,
      leasePid: e.leasePid,
      leaseProcessStartTicks: e.leaseProcessStartTicks,
      leaseBootId: e.leaseBootId,
      observedBootId: e.observedBootId,
      pidDirExists: e.pidDirExists,
      observedProcessStartTicks: e.observedProcessStartTicks,
      startTicksMatch: e.startTicksMatch,
      deadReason: e.deadReason,
      expiresInMs: e.expiresInMs,
    })),
  sampleComparisonFail: comparisonFails.slice(0, 5).map((e) => ({
    fail: e.comparisonFail,
    deadReason: e.deadReason,
    line: e.line,
  })),
};

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

console.log(JSON.stringify(report.totals, null, 2));
console.log(`status=${report.status} ok=${report.ok}`);
// count_and_flag_only exits 0 so Mac mini agents can land the honest report
// without treating it as a gate pass (ok=false in JSON).
if (status === "count_and_flag_only") process.exit(0);
process.exit(ok ? 0 : 1);
