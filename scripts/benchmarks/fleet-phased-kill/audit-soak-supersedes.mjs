#!/usr/bin/env node
/**
 * Audit same-host supersede lines from celld soak logs.
 *
 * Each INFO line:
 *   same-host supersede: fencing predecessor whose host_process is provably dead
 * is emitted only when lease expiry is still in the future AND
 * host_process::is_provably_dead_on_this_host returned true (see lab
 * node_log.rs). TTL-only fences do not use this message.
 *
 * Pre-enrichment lab builds log dead= + expires_in_ms= only.
 * Post-enrichment also logs pid=, process_start_ticks=, boot_id=.
 *
 * Usage:
 *   node scripts/benchmarks/fleet-phased-kill/audit-soak-supersedes.mjs \
 *     /tmp/fleet-soak-a.log /tmp/fleet-soak-b.log \
 *     [--out docs/benchmarks/program-cell-fleet-kill/supersede-audit-mac-mini.json] \
 *     [--expect 2117]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

/** Parse tracing-style `key=value` / `key="value"` tokens from a line. */
function parseFields(line) {
  const fields = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s]+))/g;
  let m;
  while ((m = re.exec(line))) {
    fields[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return fields;
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
    const pidRaw = f.pid;
    const pid =
      pidRaw === undefined || pidRaw === "null" || pidRaw === ""
        ? null
        : Number(pidRaw);
    const ticks = f.process_start_ticks ?? null;
    const bootId = f.boot_id ?? null;
    const hasProcessEvidence =
      pid !== null &&
      Number.isFinite(pid) &&
      pid > 0 &&
      typeof ticks === "string" &&
      ticks.length > 0 &&
      typeof bootId === "string" &&
      bootId.length > 0;
    events.push({
      file,
      dead: f.dead || null,
      expiresInMs: Number.isFinite(expiresInMs) ? expiresInMs : null,
      pid,
      processStartTicks: ticks,
      bootId,
      hasProcessEvidence,
      preTtl: Number.isFinite(expiresInMs) && expiresInMs > 0,
      line: line.slice(0, 500),
    });
  }
}

const withEvidence = events.filter((e) => e.hasProcessEvidence);
const missingEvidence = events.filter((e) => !e.hasProcessEvidence);
const notPreTtl = events.filter((e) => !e.preTtl);
const uniqueDead = new Set(events.map((e) => e.dead).filter(Boolean));
const uniqueBoot = new Set(
  withEvidence.map((e) => e.bootId).filter((b) => b && b.length)
);
const uniquePidTicks = new Set(
  withEvidence.map((e) => `${e.pid}@${e.processStartTicks}`)
);

const expectOk =
  expectCount == null ? null : events.length === expectCount;

const report = {
  kind: "celld-same-host-supersede-audit",
  auditedAt: new Date().toISOString(),
  logs: byFile,
  totals: {
    supersedes: events.length,
    withProcessEvidence: withEvidence.length,
    missingProcessEvidenceInLog: missingEvidence.length,
    preTtl: events.filter((e) => e.preTtl).length,
    notPreTtl: notPreTtl.length,
    uniqueDeadSessions: uniqueDead.size,
    uniqueBootIds: uniqueBoot.size,
    uniquePidStartPairs: uniquePidTicks.size,
  },
  expectCount,
  expectOk,
  honesty: {
    messageMeans:
      "Lab emits this INFO only when expires_ms > now AND host_process proved the owner dead on this host (pid gone or start-ticks mismatch; same boot_id). TTL-only fences do not use this message.",
    processEvidence:
      withEvidence.length === events.length && events.length > 0
        ? "Every supersede line carries pid + process_start_ticks + boot_id (post-enrichment lab)."
        : missingEvidence.length === events.length && events.length > 0
          ? "Log lines lack pid/start ticks/boot_id (pre-enrichment lab). Deadness was still evaluated in-process at fence time; this audit cannot re-read /proc retrospectively. Re-soak on enriched lab or capture logs that include those fields for a field-level check."
          : "Mixed: some lines include process evidence fields.",
    cannotRetrospectiveProc:
      "Off-host audit cannot re-open Mac mini /proc; field-level check validates the stamped identity was logged and well-formed, not a second live /proc probe.",
  },
  ok:
    events.length > 0 &&
    notPreTtl.length === 0 &&
    (expectCount == null || expectOk === true) &&
    (withEvidence.length === events.length ||
      // Message-only audit for pre-enrichment authorizing soak logs.
      (process.env.ALLOW_PRE_ENRICHMENT === "1" &&
        missingEvidence.length === events.length)),
  status:
    events.length === 0
      ? "no_supersede_lines"
      : notPreTtl.length
        ? "failed_non_pre_ttl"
        : expectCount != null && !expectOk
          ? "failed_expect_count"
          : withEvidence.length === events.length
            ? "pass_process_evidence"
            : process.env.ALLOW_PRE_ENRICHMENT === "1" &&
                missingEvidence.length === events.length
              ? "pass_message_only_pre_enrichment"
              : "failed_missing_process_evidence_fields",
  sampleMissing: missingEvidence.slice(0, 3).map((e) => e.line),
  sampleWithEvidence: withEvidence.slice(0, 3).map((e) => ({
    dead: e.dead,
    pid: e.pid,
    processStartTicks: e.processStartTicks,
    bootId: e.bootId,
    expiresInMs: e.expiresInMs,
  })),
};

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}

console.log(JSON.stringify(report.totals, null, 2));
console.log(`status=${report.status} ok=${report.ok}`);
process.exit(report.ok ? 0 : 1);
