#!/usr/bin/env node
/**
 * Merge stock + TTL-only (and optional production_preferred stub) into
 * docs/benchmarks/program-cell-fleet-kill/ttl-tradeoff-evidence.json
 *
 * Env:
 *   FLEET_PHASED_STOCK_EVIDENCE   default phased-evidence.json
 *   FLEET_PHASED_TTL30_EVIDENCE   default ttl30-evidence.json
 *   FLEET_PHASED_TRADEOFF_OUT     default ttl-tradeoff-evidence.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const DIR = join(REPO, "docs/benchmarks/program-cell-fleet-kill");

const STOCK =
  process.env.FLEET_PHASED_STOCK_EVIDENCE || join(DIR, "phased-evidence.json");
const TTL30 =
  process.env.FLEET_PHASED_TTL30_EVIDENCE || join(DIR, "ttl30-evidence.json");
const OUT =
  process.env.FLEET_PHASED_TRADEOFF_OUT || join(DIR, "ttl-tradeoff-evidence.json");

function load(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function rowFrom(evidence, id, label, notes) {
  if (!evidence) {
    return {
      id,
      label,
      status: "pending",
      notes,
    };
  }
  const cols = evidence.columns || {};
  const dups = cols.duplicates || {
    total: evidence.totalDuplicates,
    zeroDuplicates: evidence.zeroDuplicates,
  };
  const unk = cols.outcomeUnknown || {};
  const avail = cols.availability || {
    survivorSelfFences: evidence.totalSurvivorSelfFences,
    survivorRestarts: evidence.totalSurvivorRestarts,
    resumeDeadlineMisses: evidence.totalResumeDeadlineMisses,
  };
  const resume = evidence.resumeMs || {};
  const failoverAboutSec =
    resume.p50 != null ? Math.round(resume.p50 / 1000) : null;
  const completed =
    evidence.byPhase != null
      ? Object.values(evidence.byPhase).reduce((a, p) => a + (p?.n || 0), 0)
      : evidence.n;
  const targetN = evidence.n;
  const incomplete = completed != null && targetN != null && completed < targetN;
  return {
    id,
    label,
    status: incomplete ? "measured_partial" : evidence.status || "measured",
    measuredAt: evidence.measuredAt,
    n: completed,
    targetN,
    celldTtlMs: evidence.celldTtlMs,
    storageProvider: evidence.storageProvider,
    renewCadence: "celld-default-~1/3-TTL",
    leaseStore: evidence.storageProvider || "cloudflare-r2",
    columns: {
      duplicates: dups.total ?? evidence.totalDuplicates ?? null,
      zeroDuplicates: dups.zeroDuplicates ?? evidence.zeroDuplicates ?? null,
      ruleOfThreeUpperBound95: dups.ruleOfThreeUpperBound95 ?? evidence.ruleOfThreeUpperBound95,
      outcomeUnknownTotal: unk.total ?? null,
      outcomeUnknownRate: unk.rate ?? null,
      survivorSelfFences: avail.survivorSelfFences ?? evidence.totalSurvivorSelfFences ?? null,
      survivorSelfFenceRate: avail.survivorSelfFenceRate ?? null,
      survivorRestarts: avail.survivorRestarts ?? evidence.totalSurvivorRestarts ?? null,
      resumeDeadlineMisses:
        avail.resumeDeadlineMisses ?? evidence.totalResumeDeadlineMisses ?? null,
    },
    resumeMs: {
      p50: resume.p50 ?? null,
      p95: resume.p95 ?? null,
      p99: resume.p99 ?? null,
      p999: resume.p999 ?? null,
      includesSurvivorRecovery: resume.includesSurvivorRecovery === true,
    },
    failoverAboutSec,
    // Prefer the measured claim from evidence (includes availability costs).
    claim: evidence.claim ||
      (failoverAboutSec != null
        ? `Programs survive a node crash, resuming on another node in about ${failoverAboutSec} seconds, with no repeated writes; a write interrupted in flight is marked outcome unknown for a person to resolve.`
        : null),
    sampleSizeNote:
      id === "ttl_only_30s"
        ? `Small sample (n=${completed ?? "—"}) — label n when publishing; not comparable to stock N=1000.`
        : null,
    notes,
  };
}

const stock = load(STOCK);
const ttl30 = load(TTL30);

const doc = {
  kind: "celld-fleet-ttl-tradeoff",
  measuredAt: new Date().toISOString(),
  honesty:
    "TTL is the failover floor: resume p50 ≈ TTL + detection when ownership wait is included. Raising TTL alone cuts false fences but slows every crash recovery. production_preferred is planned (not a measured result) until run at the same sample size as stock — knobs (renew every ⅕ TTL + regional lease store) are not in celld 0.4.0. ttl_only_30s is a small-n tradeoff demo (label sample size), not the preferred sole tune. Not durable execution / exactly-once.",
  preferredProduction: {
    id: "production_preferred",
    label: "Preferred production (planned — not measured)",
    celldTtlMs: 10_000,
    renewCadence: "every-1/5-TTL-with-slow-renew-retry",
    leaseStore: "regional-coordination (leases); program state may stay on R2",
    expectedFailoverAboutSec: 10,
    expectedVsStock:
      "Similar resume p50 to stock (same TTL); lower survivorSelfFenceRate once renew cadence / lease store land",
    status: "planned",
    targetSampleSize: stock?.n ?? 1000,
    notes:
      "Target, not a result. Do not publish as measured. Run at the same N as stock before claiming numbers. Do not ship CELLD_TTL_MS=30000 as the production answer.",
  },
  rows: [
    rowFrom(
      stock,
      "stock_r2_ttl_10s",
      "Stock — CELLD_TTL_MS=10000, leases on R2, renew ~⅓ TTL",
      "Failover floor ≈ 10s; measured resume p50 includes ownership wait."
    ),
    rowFrom(
      ttl30,
      "ttl_only_30s",
      "TTL-only stretch — CELLD_TTL_MS=30000, same renew fraction, R2 (n=40)",
      "Tradeoff demo at small sample (n=40). Expect fewer false fences, slower failover (~30s). Not the preferred sole production lever. Label n when publishing."
    ),
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`wrote ${OUT}`);
for (const r of doc.rows) {
  console.log(
    `  ${r.id}: status=${r.status} n=${r.n ?? "—"} dups=${r.columns?.duplicates ?? "—"} fences=${r.columns?.survivorSelfFences ?? "—"} resume_p50=${r.resumeMs?.p50 ?? "—"} failover≈${r.failoverAboutSec ?? "—"}s`
  );
}
