#!/usr/bin/env node
/**
 * Binary bisect of HTTP-only (and HTTP-shell) layers under clawql_http.
 *
 * Board context (round 10): Express+Streamable echo is stack_clean. Auth cache /
 * OTel export / budget flush are OFF under equal-arm noAuth — this runner still
 * prints the layer banner and bisects remaining killable layers:
 *   audit | prune | als (request context) | auth middleware
 *
 * Strategy: all-kill first; if spikes remain → tool×HTTP (not shell). If clean,
 * binary add-back until spikes return.
 *
 * Usage:
 *   MT_PIN_CORES=1 MT_ITERS=2000 \
 *     node scripts/benchmarks/http-only-layer-bisect.mjs
 *
 * Env:
 *   MT_ITERS (default 2000)  MT_TURNS (default 12)  MT_SPIKE_MS (default 300)
 *   MT_OUT  MT_PIN_CORES  CLAWQL_HTTP_LAYER_EVENTS (default 1 on each child)
 *   MT_BISECT_STEPS — comma list of mask names, or "auto" (default)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MT = join(ROOT, "scripts", "benchmarks", "gateway-multi-multiturn.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MT_OUT ?? "http-only-layer-bisect.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "http-only-layer-bisect.json");

const TURNS = Math.max(10, Math.min(40, Number(process.env.MT_TURNS ?? 12) || 12));
const ITERS = Math.max(50, Number(process.env.MT_ITERS ?? 2000) || 2000);
const SPIKE_MS = Math.max(50, Number(process.env.MT_SPIKE_MS ?? 300) || 300);

/** Layer id → env that DISABLES it (kill = on for bisect "off" half). */
const LAYERS = {
  audit: { CLAWQL_AUDIT_TOOL_CALLS: "0" },
  prune: { CLAWQL_HTTP_SKIP_PRUNE: "1" },
  als: { CLAWQL_HTTP_SKIP_REQUEST_CONTEXT: "1" },
  auth: { CLAWQL_HTTP_SKIP_AUTH: "1" },
};

const LAYER_IDS = Object.keys(LAYERS);

function maskEnv(enabledLayers) {
  const env = {};
  for (const id of LAYER_IDS) {
    if (!enabledLayers.has(id)) {
      Object.assign(env, LAYERS[id]);
    }
  }
  return env;
}

function parseStepSpec(spec) {
  const raw = (spec ?? "auto").trim().toLowerCase();
  if (raw === "auto") {
    // Binary: all-off, half A (audit+prune), half B (als+auth), then singles if needed.
    return [
      { name: "all_kill", on: [] },
      { name: "half_audit_prune", on: ["audit", "prune"] },
      { name: "half_als_auth", on: ["als", "auth"] },
      { name: "board_default", on: LAYER_IDS.slice() },
    ];
  }
  return raw.split(",").map((name) => {
    const t = name.trim();
    if (t === "board_default" || t === "all_on") return { name: t, on: LAYER_IDS.slice() };
    if (t === "all_kill" || t === "all_off") return { name: t, on: [] };
    if (t.startsWith("only_")) {
      const id = t.slice(5);
      if (!LAYERS[id]) throw new Error(`unknown layer in only_: ${id}`);
      return { name: t, on: [id] };
    }
    if (t.startsWith("without_")) {
      const id = t.slice(8);
      if (!LAYERS[id]) throw new Error(`unknown layer in without_: ${id}`);
      return { name: t, on: LAYER_IDS.filter((x) => x !== id) };
    }
    throw new Error(`unknown step ${t}`);
  });
}

function summarizeArm(doc) {
  const boardRow = doc.board?.clawql_http;
  const arm = doc.arms?.clawql_http;
  const flow = boardRow?.flow_e2e_ms ?? arm?.board?.flow_e2e_ms;
  if (!flow) return null;
  const geKey =
    SPIKE_MS === 300
      ? "n_ge_300ms"
      : SPIKE_MS === 200
        ? "n_ge_200ms"
        : SPIKE_MS === 100
          ? "n_ge_100ms"
          : null;
  const nGe =
    geKey && typeof flow[geKey] === "number"
      ? flow[geKey]
      : Array.isArray(flow.worst)
        ? flow.worst.filter((w) => w.ms >= SPIKE_MS).length
        : null;
  const slowTop = arm?.slow_flows_top ?? boardRow?.slow_flows_top ?? [];
  // Flow 1 is cold (tools/list + first search) — rare mid-run stalls are the hunt.
  const midSpikes = slowTop.filter((f) => f.flow > 1 && f.ms >= SPIKE_MS);
  return {
    id: "clawql_http",
    p50_ms: flow.p50_ms ?? null,
    p99_ms: flow.p99_ms ?? null,
    p999_ms: flow.p999_ms ?? null,
    n: flow.n ?? null,
    n_ge_spike_ms: nGe,
    n_mid_ge_spike_ms: midSpikes.length,
    max_ms: flow.max_ms ?? null,
    max_mid_ms: midSpikes.length ? Math.max(...midSpikes.map((f) => f.ms)) : null,
    http_layer: boardRow?.http_layer ?? arm?.http_layer ?? null,
    http_layer_banner: boardRow?.http_layer_banner ?? arm?.http_layer_banner ?? null,
    slow_flows_top: slowTop.slice(0, 8),
  };
}

function extractBanner(stderrText) {
  const lines = String(stderrText || "").split("\n");
  return lines.find((l) => l.includes("[clawql-http-layer] banner")) ?? null;
}

function extractSlowLayerEvents(stderrText, limit = 40) {
  const out = [];
  for (const line of String(stderrText || "").split("\n")) {
    if (!line.includes("[clawql-http-layer]")) continue;
    if (line.includes("banner")) continue;
    const m = /duration_ms=([\d.]+)/.exec(line);
    if (m && Number(m[1]) >= 5) out.push(line.trim());
    else if (line.includes("kind=cache_miss") || line.includes("kind=otel_export") || line.includes("kind=budget_flush")) {
      out.push(line.trim());
    }
  }
  return out.slice(0, limit);
}

async function runStep(step) {
  const stepOut = join(OUT_DIR, `http-only-layer-bisect-${step.name}.json`);
  const layerOn = new Set(step.on);
  const layerEnv = maskEnv(layerOn);
  const env = {
    ...process.env,
    MT_ARMS: "clawql_http",
    MT_TURNS: String(TURNS),
    MT_ITERS: String(ITERS),
    MT_OUT: `http-only-layer-bisect-${step.name}.json`,
    MT_PIN_CORES: process.env.MT_PIN_CORES ?? "1",
    MT_STALL_DIAG: process.env.MT_STALL_DIAG ?? "1",
    // Slow-only layer lines by default (duration ≥ CLAWQL_HTTP_LAYER_EVENT_SLOW_MS).
    // Set CLAWQL_HTTP_LAYER_EVENTS=1 only on short boards — it logs every prune/auth.
    ...(process.env.CLAWQL_HTTP_LAYER_EVENTS
      ? { CLAWQL_HTTP_LAYER_EVENTS: process.env.CLAWQL_HTTP_LAYER_EVENTS }
      : {}),
    CLAWQL_HTTP_LAYER_EVENT_SLOW_MS: process.env.CLAWQL_HTTP_LAYER_EVENT_SLOW_MS ?? "20",
    ...layerEnv,
  };
  // Ensure board_default does not inherit skip flags from parent.
  if (step.name === "board_default" || step.name === "all_on") {
    delete env.CLAWQL_HTTP_SKIP_AUTH;
    delete env.CLAWQL_HTTP_SKIP_PRUNE;
    delete env.CLAWQL_HTTP_SKIP_REQUEST_CONTEXT;
    delete env.CLAWQL_AUDIT_TOOL_CALLS;
  }

  console.error(`\n[http-layer-bisect] step=${step.name} layers_on=[${[...layerOn].join(",") || "-"}]`);
  console.error(`[http-layer-bisect] kill_env=${JSON.stringify(layerEnv)}`);

  const stderrChunks = [];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MT], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (b) => process.stderr.write(b));
    child.stderr.on("data", (b) => {
      stderrChunks.push(b);
      process.stderr.write(b);
    });
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stderrText = Buffer.concat(stderrChunks).toString("utf8");
  if (code !== 0) {
    return {
      name: step.name,
      layers_on: [...layerOn],
      kill_env: layerEnv,
      ok: false,
      exit_code: code,
      banner: extractBanner(stderrText),
      slow_layer_events: extractSlowLayerEvents(stderrText),
    };
  }

  const written = existsSync(stepOut) ? stepOut : join(OUT_DIR, env.MT_OUT);
  const doc = JSON.parse(await readFile(written, "utf8"));
  const summary = summarizeArm(doc);
  // Prefer mid-run spikes (flow>1). Cold flow-1 alone is not a shell-layer hit.
  const spiked =
    summary != null &&
    ((summary.n_mid_ge_spike_ms ?? 0) > 0 ||
      (summary.max_mid_ms != null && summary.max_mid_ms >= SPIKE_MS) ||
      ((summary.n ?? 0) >= 500 &&
        (summary.n_ge_spike_ms ?? 0) >= 2 &&
        summary.p999_ms != null &&
        summary.p999_ms >= SPIKE_MS));

  return {
    name: step.name,
    layers_on: [...layerOn],
    kill_env: layerEnv,
    ok: true,
    exit_code: 0,
    artifact: written,
    banner: summary?.http_layer_banner ?? extractBanner(stderrText),
    http_layer: summary?.http_layer ?? null,
    slow_layer_events: extractSlowLayerEvents(stderrText),
    clawql_http: summary,
    spiked,
    spike_ms: SPIKE_MS,
  };
}

function verdictFromSteps(steps) {
  const by = Object.fromEntries(steps.map((s) => [s.name, s]));
  const allKill = by.all_kill;
  const board = by.board_default;
  const halfA = by.half_audit_prune;
  const halfB = by.half_als_auth;

  if (board && !board.spiked && allKill && !allKill.spiked) {
    return {
      code: "no_spike_this_host",
      note: "Neither board_default nor all_kill showed ≥spike_ms — raise MT_ITERS or re-check host load.",
    };
  }
  if (allKill?.spiked) {
    return {
      code: "tool_x_http",
      note: "Spikes remain with audit/prune/als/auth killed — not those shell layers; next: createMcpHttpApp + lean catalog / search vs execute.",
    };
  }
  if (allKill && !allKill.spiked && board?.spiked) {
    if (halfA?.spiked && !halfB?.spiked) {
      return {
        code: "half_audit_prune",
        note: "Spikes with audit+prune on; als+auth off — bisect audit vs prune next (without_audit / without_prune).",
      };
    }
    if (halfB?.spiked && !halfA?.spiked) {
      return {
        code: "half_als_auth",
        note: "Spikes with als+auth on; audit+prune off — bisect als vs auth next.",
      };
    }
    if (halfA?.spiked && halfB?.spiked) {
      return {
        code: "interaction",
        note: "Both halves spike — interaction or unstable host; re-run singles.",
      };
    }
    return {
      code: "shell_clears",
      note: "all_kill clean, board spikes; halves inconclusive — run MT_BISECT_STEPS=without_audit,without_prune,without_als,without_auth",
    };
  }
  return {
    code: "partial",
    note: "See per-step spiked flags; continue with only_/without_ steps.",
  };
}

async function main() {
  if (!existsSync(join(ROOT, "dist", "server-http.js"))) {
    throw new Error("dist/server-http.js missing — build before bisect");
  }
  await mkdir(OUT_DIR, { recursive: true });
  const steps = parseStepSpec(process.env.MT_BISECT_STEPS);
  const results = [];
  for (const step of steps) {
    results.push(await runStep(step));
  }
  const verdict = verdictFromSteps(results);
  const doc = {
    suite: "http-only-layer-bisect",
    measuredAt: new Date().toISOString(),
    config: {
      turns: TURNS,
      iters: ITERS,
      spike_ms: SPIKE_MS,
      layers: LAYER_IDS,
      steps: steps.map((s) => s.name),
      pin_cores: process.env.MT_PIN_CORES ?? "1",
    },
    board_suspect_map: {
      auth_cache_jwks: "off on equal-arm (CLAWQL_AUTH_MODE=noAuth) — falsified for publish board",
      otel_batch_export: "off unless CLAWQL_ENABLE_OTEL_TRACING=1 — falsified for publish board",
      budget_flush: "no VK/payments path under SKIP_PAYMENTS — falsified for publish board",
      remaining_killable: LAYER_IDS,
    },
    steps: results,
    verdict,
  };
  await writeFile(OUT_PATH, JSON.stringify(doc, null, 2));
  console.error(`\n[http-layer-bisect] verdict=${verdict.code} — ${verdict.note}`);
  console.error(`[http-layer-bisect] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[http-layer-bisect] fatal:", err);
  process.exit(1);
});
