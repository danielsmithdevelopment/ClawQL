#!/usr/bin/env node
/**
 * Re-run all_kill vs board_default three times each; report spike-count ranges.
 * Does not conclude from a single pair (round11 lesson).
 *
 *   MT_PIN_CORES=1 MT_ITERS=2500 node scripts/benchmarks/http-layer-variance-3x.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MT = join(ROOT, "scripts", "benchmarks", "gateway-multi-multiturn.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const ITERS = Math.max(50, Number(process.env.MT_ITERS ?? 2500) || 2500);
const TURNS = Math.max(10, Number(process.env.MT_TURNS ?? 12) || 12);
const REPS = Math.max(2, Math.min(5, Number(process.env.MT_VARIANCE_REPS ?? 3) || 3));
const SPIKE_MS = 300;

const CONFIGS = {
  all_kill: {
    CLAWQL_AUDIT_TOOL_CALLS: "0",
    CLAWQL_HTTP_SKIP_PRUNE: "1",
    CLAWQL_HTTP_SKIP_REQUEST_CONTEXT: "1",
    CLAWQL_HTTP_SKIP_AUTH: "1",
  },
  board_default: {},
};

function midSpikes(slowTop) {
  return (slowTop || []).filter((f) => f.flow > 1 && f.ms >= SPIKE_MS);
}

async function runOne(name, rep) {
  const outName = `http-layer-variance-${name}-r${rep}.json`;
  const outPath = join(OUT_DIR, outName);
  const env = {
    ...process.env,
    MT_ARMS: "clawql_http",
    MT_TURNS: String(TURNS),
    MT_ITERS: String(ITERS),
    MT_OUT: outName,
    MT_PIN_CORES: process.env.MT_PIN_CORES ?? "1",
    MT_STALL_DIAG: process.env.MT_STALL_DIAG ?? "0",
    ...CONFIGS[name],
  };
  if (name === "board_default") {
    delete env.CLAWQL_HTTP_SKIP_AUTH;
    delete env.CLAWQL_HTTP_SKIP_PRUNE;
    delete env.CLAWQL_HTTP_SKIP_REQUEST_CONTEXT;
    delete env.CLAWQL_AUDIT_TOOL_CALLS;
  }
  console.error(`[variance] ${name} rep=${rep}/${REPS}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MT], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) return { name, rep, ok: false, exit_code: code };
  const doc = JSON.parse(await readFile(outPath, "utf8"));
  const flow = doc.board?.clawql_http?.flow_e2e_ms;
  const slow = doc.board?.clawql_http?.slow_flows_top || doc.arms?.clawql_http?.slow_flows_top || [];
  const mid = midSpikes(slow);
  return {
    name,
    rep,
    ok: true,
    artifact: outPath,
    p50_ms: flow?.p50_ms ?? null,
    p999_ms: flow?.p999_ms ?? null,
    n_ge_300ms: flow?.n_ge_300ms ?? null,
    n_mid_ge_300ms: mid.length,
    max_mid_ms: mid.length ? Math.max(...mid.map((f) => f.ms)) : null,
    max_ms: flow?.max_ms ?? null,
  };
}

function range(vals) {
  const xs = vals.filter((v) => typeof v === "number");
  if (!xs.length) return null;
  return { min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length };
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server-http.js"))) {
    throw new Error("dist/server-http.js missing");
  }
  await mkdir(OUT_DIR, { recursive: true });
  const runs = [];
  for (const name of Object.keys(CONFIGS)) {
    for (let r = 1; r <= REPS; r++) {
      runs.push(await runOne(name, r));
    }
  }
  const by = Object.fromEntries(
    Object.keys(CONFIGS).map((name) => [name, runs.filter((x) => x.name === name && x.ok)])
  );
  const summary = {
    suite: "http-layer-variance-3x",
    measuredAt: new Date().toISOString(),
    config: { turns: TURNS, iters: ITERS, reps: REPS, spike_ms: SPIKE_MS },
    runs,
    ranges: Object.fromEntries(
      Object.entries(by).map(([name, rs]) => [
        name,
        {
          n_ge_300ms: range(rs.map((r) => r.n_ge_300ms)),
          n_mid_ge_300ms: range(rs.map((r) => r.n_mid_ge_300ms)),
          p999_ms: range(rs.map((r) => r.p999_ms)),
        },
      ])
    ),
  };
  const a = summary.ranges.all_kill?.n_ge_300ms;
  const b = summary.ranges.board_default?.n_ge_300ms;
  let verdict = "insufficient";
  let note = "";
  if (a && b) {
    if (a.min > b.max) {
      verdict = "all_kill_higher_stable";
      note = "all_kill spike counts strictly above board_default across reps — timing/interaction, not a single layer.";
    } else if (b.min > a.max) {
      verdict = "board_higher_stable";
      note = "board_default worse across reps — unexpected vs round11 pair.";
    } else {
      verdict = "ranges_overlap";
      note = "Spike-count ranges overlap — do not read round11's 25 vs 4 as a stable effect.";
    }
  }
  summary.verdict = { code: verdict, note };
  const out = join(OUT_DIR, "http-layer-variance-3x.json");
  await writeFile(out, JSON.stringify(summary, null, 2));
  console.error(`[variance] verdict=${verdict} — ${note}`);
  console.error(`[variance] wrote ${out}`);
  console.log(JSON.stringify(summary.ranges, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
