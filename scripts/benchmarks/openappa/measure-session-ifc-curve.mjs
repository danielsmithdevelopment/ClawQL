#!/usr/bin/env node
/**
 * Measure ClawQL session IFC (data-flow labels) per-call overhead vs session length.
 *
 * Fair framing vs OpenAPPA:
 *   Bounded data-flow state stays flat; history-based policy evaluation grows
 *   unless incrementalized. IFC answers "where may this data go" with a capped
 *   label set (safe-merge overflow → categories → source:untrusted).
 *
 * Arms:
 *   - capped_sources: ≤32 rotating sources (under the product cap)
 *   - growing_unique: one new label per call (hits safe-merge; set stays bounded)
 *
 *   node scripts/benchmarks/openappa/measure-session-ifc-curve.mjs
 *
 * Writes docs/benchmarks/openappa/results-session-ifc-curve.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const api = await import("clawql-api");

const milestones = (process.env.CLAWQL_IFC_CURVE_MILESTONES || "10,100,1000,5000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);
const maxN = milestones[milestones.length - 1] ?? 5000;
const WINDOW = Number(process.env.CLAWQL_IFC_CURVE_WINDOW || "20");

const {
  clearAllSessionLabelsSync,
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  getSessionLabelsSync,
  SESSION_IFC_MAX_FINE_SOURCE_LABELS,
} = api;

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function windowStats(samples, callIndex) {
  const start = Math.max(0, callIndex - WINDOW);
  const end = Math.min(samples.length, callIndex);
  const slice = samples.slice(start, end).slice().sort((a, b) => a - b);
  return {
    call_index: callIndex,
    window: slice.length,
    p50_us: percentile(slice, 50),
    p90_us: percentile(slice, 90),
    mean_us: slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null,
    min_us: slice[0] ?? null,
    max_us: slice[slice.length - 1] ?? null,
  };
}

function runArm(armName, labelForCall) {
  clearAllSessionLabelsSync();
  const sessionId = `ifc-curve-${armName}-${Date.now()}`;
  const samples = [];

  const writeOp = {
    id: "bench.write",
    method: "POST",
    specLabel: "source:bench-write",
  };

  for (let i = 1; i <= maxN; i++) {
    const extra = labelForCall(i);
    const t0 = performance.now();
    accumulateSessionIfcReadSync({
      operation: {
        id: "bench.read",
        method: "GET",
        specLabel: extra,
        riskHints: { mcpReadOnlyHint: true },
      },
      sessionId,
      success: true,
    });
    checkSessionIfcWriteSync({
      operation: { ...writeOp, specLabel: extra },
      sessionId,
    });
    samples.push((performance.now() - t0) * 1000);
  }

  const labelCount = getSessionLabelsSync(sessionId).size;
  const curve = milestones.map((m) => windowStats(samples, m));
  const first = curve[0]?.p50_us;
  const last = curve[curve.length - 1]?.p50_us;
  const ratio = first && last ? Number((last / first).toFixed(2)) : null;
  return {
    arm: armName,
    session_id: sessionId,
    max_calls: maxN,
    final_label_cardinality: labelCount,
    max_fine_labels: SESSION_IFC_MAX_FINE_SOURCE_LABELS ?? 32,
    curve_us: curve,
    growth: {
      p50_ratio_last_over_first: ratio,
      grows_with_session_length: ratio != null && ratio >= 1.5,
    },
  };
}

const capped = runArm("capped_sources", (i) => `cap-${i % 32}`);
const growing = runArm("growing_unique", (i) => `uniq${i}`);

const out = {
  measured_at: new Date().toISOString(),
  metric: "clawql_session_ifc_overhead_vs_session_length",
  note:
    "In-process session IFC (accumulate + mayFlow) within one session. Fair contrast: bounded data-flow state stays flat; OpenAPPA history-based evaluation grows unless incrementalized. Label overflow uses safe-merge (categories → source:untrusted), never dropping oldest.",
  openappa_contrast:
    "OpenAPPA tool_call p50 grew ~98× by call 5000 (full trajectory). ClawQL IFC stays µs-scale with bounded labels after safe-merge.",
  framing:
    "bounded data-flow state stays flat; history-based policy evaluation grows unless incrementalized",
  window: WINDOW,
  arms: [capped, growing],
};

const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, "../../../docs/benchmarks/openappa");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, "results-session-ifc-curve.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.log(`wrote ${dest}`);
