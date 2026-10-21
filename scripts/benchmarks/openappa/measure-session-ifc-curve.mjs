#!/usr/bin/env node
/**
 * Measure ClawQL session IFC (data-flow labels) per-call overhead vs session length.
 *
 * Contrast with OpenAPPA's growing /hook cost: a label set that only unions should
 * stay roughly flat. Two arms:
 *   - capped_sources: ≤32 rotating sources (production-like)
 *   - growing_unique: one new label per call (stress Set size)
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
  const samples = []; // microseconds per call (accumulate read + check write)

  const readOp = {
    id: "bench.read",
    method: "GET",
    specLabel: "source:bench-read",
    riskHints: { mcpReadOnlyHint: true },
  };
  const writeOp = {
    id: "bench.write",
    method: "POST",
    specLabel: "source:bench-write",
  };

  for (let i = 1; i <= maxN; i++) {
    // Grow / rotate labels on the session the way a real host does after reads.
    const extra = labelForCall(i);
    const t0 = performance.now();
    accumulateSessionIfcReadSync({
      operation: { ...readOp, specLabel: extra },
      sessionId,
      success: true,
    });
    // Write check against a compatible dest (same source family) so mayFlow runs fully.
    checkSessionIfcWriteSync({
      operation: { ...writeOp, specLabel: extra },
      sessionId,
    });
    samples.push((performance.now() - t0) * 1000); // µs
  }

  const curve = milestones.map((m) => windowStats(samples, m));
  const first = curve[0]?.p50_us;
  const last = curve[curve.length - 1]?.p50_us;
  const ratio = first && last ? Number((last / first).toFixed(2)) : null;
  return {
    arm: armName,
    session_id: sessionId,
    max_calls: maxN,
    curve_us: curve,
    growth: {
      p50_ratio_last_over_first: ratio,
      grows_with_session_length: ratio != null && ratio >= 1.5,
    },
  };
}

const capped = runArm("capped_sources", (i) => `source:cap-${i % 32}`);
const growing = runArm("growing_unique", (i) => `source:uniq-${i}`);

const out = {
  measured_at: new Date().toISOString(),
  metric: "clawql_session_ifc_overhead_vs_session_length",
  note:
    "In-process session IFC (accumulate read labels + mayFlow write check) within one session. Contrast with OpenAPPA results-session-length-curve.json. Times in microseconds.",
  openappa_contrast:
    "OpenAPPA tool_call p50 grew ~98× by call 5000; ClawQL IFC should stay near-flat when labels are a compact set.",
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
