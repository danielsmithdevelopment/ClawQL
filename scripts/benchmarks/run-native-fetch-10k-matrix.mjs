#!/usr/bin/env node
/**
 * Full-scale CLAWQL_NATIVE_FETCH validation: 10k flows × 3 reps × (Node HTTP, Bun HTTP),
 * plus one Node node-fetch control. Writes boards + native-fetch-10k-matrix.json.
 *
 *   node scripts/benchmarks/run-native-fetch-10k-matrix.mjs
 *   MT_MATRIX_ITERS=10000 MT_MATRIX_REPS=3 node scripts/benchmarks/run-native-fetch-10k-matrix.mjs
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "docs/benchmarks/gateway-multi-comparison");
const ART = "/opt/cursor/artifacts/native-fetch-10k";
const ITERS = Math.max(100, Number(process.env.MT_MATRIX_ITERS ?? 10_000) || 10_000);
const REPS = Math.max(1, Number(process.env.MT_MATRIX_REPS ?? 3) || 3);
const INCLUDE_NOFETCH = ["1", "true", "yes"].includes(
  (process.env.MT_MATRIX_INCLUDE_NOFETCH ?? "1").trim().toLowerCase()
);

const jobs = [];
if (INCLUDE_NOFETCH) {
  jobs.push({
    id: "node_nodefetch_control",
    arms: "clawql_http",
    native: false,
    out: "gateway-multi-multiturn-clawql-http-nodefetch-10k-ctrl.json",
  });
}
for (let rep = 1; rep <= REPS; rep++) {
  jobs.push({
    id: `node_native_r${rep}`,
    arms: "clawql_http",
    native: true,
    out: `gateway-multi-multiturn-clawql-http-native-10k-r${rep}.json`,
  });
  jobs.push({
    id: `bun_native_r${rep}`,
    arms: "clawql_http_bun",
    native: true,
    out: `gateway-multi-multiturn-clawql-http-bun-native-10k-r${rep}.json`,
  });
}

async function runJobAsync(job) {
  await mkdir(ART, { recursive: true });
  const env = {
    ...process.env,
    MT_ARMS: job.arms,
    MT_ITERS: String(ITERS),
    MT_STALL_DIAG: "1",
    MT_OUT: job.out,
    CLAWQL_UPSTREAM_FETCH_DIAG: "1",
    CLAWQL_HTTP_PARSE_TIMING: "1",
  };
  if (job.native) env.CLAWQL_NATIVE_FETCH = "1";
  else delete env.CLAWQL_NATIVE_FETCH;

  const stdoutPath = join(ART, `${job.id}.stdout.log`);
  const stderrPath = join(ART, `${job.id}.stderr.log`);
  console.error(`[matrix] start ${job.id} native=${job.native} arms=${job.arms}`);
  const t0 = Date.now();

  const code = await new Promise((resolve) => {
    const child = spawn("node", ["scripts/benchmarks/gateway-multi-multiturn.mjs"], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(createWriteStream(stdoutPath));
    child.stderr.pipe(createWriteStream(stderrPath));
    child.on("close", (c) => resolve(c ?? 1));
  });
  const elapsed_s = Number(((Date.now() - t0) / 1000).toFixed(1));
  const boardPath = join(OUT_DIR, job.out);
  let summary = { id: job.id, ok: code === 0, elapsed_s, board: job.out, native: job.native };
  if (existsSync(boardPath)) {
    const j = JSON.parse(readFileSync(boardPath, "utf8"));
    const armId = job.arms.includes("bun") ? "clawql_http_bun" : "clawql_http";
    const b = j.board?.[armId] || j.arms?.[armId]?.board;
    if (b) {
      summary = {
        ...summary,
        flow_p50_ms: b.flow_e2e_ms?.p50_ms,
        flow_p99_ms: b.flow_e2e_ms?.p99_ms,
        flow_p999_ms: b.flow_e2e_ms?.p999_ms,
        flow_max_ms: b.flow_e2e_ms?.max_ms,
        execute_max_ms: b.execute_latency_ms?.max_ms,
        search_max_ms: b.search_latency_ms?.max_ms,
        rss_mb_ready: b.rss_mb_ready,
        rss_mb_median: b.rss_mb_median,
        rss_mb_max: b.rss_mb_max,
        upstream_tcp: j.upstream_diagnostics?.tcp_connects,
        upstream_max_handle_ms: j.upstream_diagnostics?.max_handle_ms,
      };
    }
  }
  console.error(
    `[matrix] done ${job.id} exit=${code} p999=${summary.flow_p999_ms ?? "-"} rss_med=${summary.rss_mb_median ?? "-"} ${elapsed_s}s`
  );
  return summary;
}

async function main() {
  await mkdir(ART, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  const results = [];
  for (const job of jobs) {
    results.push(await runJobAsync(job));
  }
  const summary = {
    suite: "native-fetch-10k-matrix",
    measuredAt: new Date().toISOString(),
    iters: ITERS,
    reps: REPS,
    results,
  };
  const outPath = join(OUT_DIR, "native-fetch-10k-matrix.json");
  await writeFile(outPath, JSON.stringify(summary, null, 2) + "\n");
  await writeFile(join(ART, "matrix-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.error(`[matrix] wrote ${outPath}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
