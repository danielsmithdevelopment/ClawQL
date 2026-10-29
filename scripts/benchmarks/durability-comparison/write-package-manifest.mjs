#!/usr/bin/env node
/**
 * Pin the pilot package: commit + SHA-256 of evidence files + 95% zero-event bounds.
 * Writes docs/benchmarks/durability-proof/comparison/PACKAGE-MANIFEST.json
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = join(root, "docs/benchmarks/durability-proof/comparison/PACKAGE-MANIFEST.json");

/** Clopper-Pearson-style one-sided 95% upper bound when 0 events in n trials: 1 - 0.05^(1/n). */
function upperBound95ZeroEvents(n) {
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.round((1 - Math.pow(0.05, 1 / n)) * 10000) / 10000;
}

function sha256File(rel) {
  const abs = join(root, rel);
  const buf = readFileSync(abs);
  return {
    path: rel,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

const commit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
const short = commit.slice(0, 9);
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  cwd: root,
  encoding: "utf8",
}).trim();

const files = [
  "docs/benchmarks/durability-proof/comparison/evidence.json",
  "docs/benchmarks/durability-proof/comparison/crash-points-evidence.json",
  "docs/benchmarks/durability-proof/resume-vs-journal/evidence.json",
  "docs/benchmarks/durability-proof/comparison/trace-conformance-summary.json",
].map(sha256File);

const peer = JSON.parse(readFileSync(join(root, files[0].path), "utf8"));
const crash = JSON.parse(readFileSync(join(root, files[1].path), "utf8"));
const tierf = JSON.parse(readFileSync(join(root, files[2].path), "utf8"));

const peerNs = [];
for (const arm of peer.arms || []) {
  for (const m of arm.modes || []) peerNs.push(m.n);
}
const peerN = peerNs.length ? Math.min(...peerNs) : null;

const crashNs = [];
for (const row of crash.rows || []) {
  for (const m of row.modes || []) crashNs.push(m.n);
}
const crashN = crashNs.length ? Math.min(...crashNs) : null;

const manifest = {
  kind: "durability-pilot-package-manifest",
  generatedAt: new Date().toISOString(),
  git: { branch, commit, short },
  evidence: files,
  sampleSizes: {
    peerBoardN: peerN,
    crashPointsN: crashN,
    peerBoardMeasuredAt: peer.measuredAt,
    crashPointsMeasuredAt: crash.measuredAt,
    resumeVsJournalMeasuredAt: tierf.measuredAt,
  },
  /** When 0 duplicate events observed, 95% one-sided upper bound on true rate. */
  zeroEventUpperBound95: {
    formula: "1 - 0.05^(1/N)",
    peerBoard: peerN != null ? upperBound95ZeroEvents(peerN) : null,
    crashPoints: crashN != null ? upperBound95ZeroEvents(crashN) : null,
    note: "Use for zero-count rate claims only. N=10 → ~0.26; N=50 → ~0.06. Prefer 'behaves as designed' wording for small-N harness checks.",
  },
  traceConformance: (() => {
    try {
      return {
        ...JSON.parse(
          readFileSync(
            join(root, "docs/benchmarks/durability-proof/comparison/trace-conformance-summary.json"),
            "utf8"
          )
        ),
        wording:
          "every exported trace from these runs satisfies the model safety rules — not “the implementation is verified”",
      };
    } catch {
      return {
        note: "Run TRACE boards then refresh this manifest.",
      };
    }
  })(),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`wrote ${out}`);
console.log(JSON.stringify({ commit: short, peerN, crashN, files: files.map((f) => f.sha256.slice(0, 12)) }, null, 2));
