#!/usr/bin/env node
/**
 * HTTP stack bisect — do-nothing echo through Express + Streamable HTTP
 * (same shape as ClawQL bench), under isolated taskset cores.
 *
 * Compare flow e2e p999 to clawql_http on the gw2core board:
 *   - Spikes ≈ ClawQL HTTP → stack is the cause (SDK transport / Express / sessions)
 *   - Clean tails → ClawQL per-request logic; add layers back next
 *
 * Usage:
 *   MT_PIN_CORES=1 MT_ITERS=3000 MT_TURNS=12 MT_RPCS_PER_TURN=2 \
 *     node scripts/benchmarks/http-stack-echo-bisect.mjs
 *
 * Env:
 *   MT_ITERS (default 3000)  MT_TURNS (default 12)  MT_RPCS_PER_TURN (default 2)
 *   MT_OUT  MT_PIN_CORES  MT_MOCK_CPUS / MT_GATEWAY_CPUS / MT_CLIENT_CPUS
 *   BUN_BIN — if set with MT_RUNTIME=bun, run echo under Bun
 *   MT_RUNTIME=node|bun (default node)
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { spawn, spawnSync } from "node:child_process";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(ROOT, "scripts", "benchmarks", "lib");
const ECHO_SCRIPT = join(LIB, "equal-arm-echo-http-mcp.mjs");
const OUT_DIR = join(ROOT, "docs", "benchmarks", "gateway-multi-comparison");
const OUT_NAME = (process.env.MT_OUT ?? "http-stack-echo-bisect.json").replace(
  /[^a-zA-Z0-9._-]/g,
  ""
);
const OUT_PATH = join(OUT_DIR, OUT_NAME || "http-stack-echo-bisect.json");

const TURNS = Math.max(1, Math.min(40, Number(process.env.MT_TURNS ?? 12) || 12));
const ITERS = Math.max(1, Number(process.env.MT_ITERS ?? 3000) || 3000);
const RPCS_PER_TURN = Math.max(1, Math.min(8, Number(process.env.MT_RPCS_PER_TURN ?? 2) || 2));
const RUNTIME = (process.env.MT_RUNTIME ?? "node").trim().toLowerCase() === "bun" ? "bun" : "node";
const PROGRESS_EVERY = Math.max(0, Number(process.env.MT_PROGRESS_EVERY ?? 500) || 500);

function resolveBunBin() {
  const env = process.env.BUN_BIN?.trim();
  if (env && existsSync(env)) return env;
  for (const p of ["/home/ubuntu/.bun/bin/bun", `${process.env.HOME}/.bun/bin/bun`]) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

function countCpuList(spec) {
  if (!spec) return 0;
  let n = 0;
  for (const part of String(spec).split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) n += b - a + 1;
    } else if (/^\d+$/.test(t)) n += 1;
  }
  return n;
}

function resolveCoreLayout() {
  const nproc = cpus()?.length || 0;
  const want = ["1", "true", "yes"].includes((process.env.MT_PIN_CORES ?? "").trim().toLowerCase());
  const mock = (process.env.MT_MOCK_CPUS || "").trim() || null;
  const gateway = (process.env.MT_GATEWAY_CPUS || "").trim() || null;
  const client = (process.env.MT_CLIENT_CPUS || "").trim() || null;
  if (!want && !mock && !gateway && !client) {
    return {
      enabled: false,
      nproc,
      mock_cpus: null,
      gateway_cpus: null,
      client_cpus: null,
      gateway_cpu_count: 0,
      layout_mode: "unpinned",
      note: "MT_PIN_CORES off",
    };
  }
  if (nproc < 3 && want && !mock && !gateway && !client) {
    return {
      enabled: false,
      nproc,
      mock_cpus: null,
      gateway_cpus: null,
      client_cpus: null,
      gateway_cpu_count: 0,
      layout_mode: "skipped_nproc",
      note: `nproc=${nproc}<3`,
    };
  }
  let mockCpus = mock;
  let gatewayCpus = gateway;
  let clientCpus = client;
  let layoutMode = "custom";
  if (!mock && !gateway && !client) {
    if (nproc >= 4) {
      mockCpus = "0";
      gatewayCpus = "1-2";
      clientCpus = "3";
      layoutMode = "gateway_2core";
    } else {
      mockCpus = "0";
      gatewayCpus = "1";
      clientCpus = "2";
      layoutMode = "gateway_1core_nproc3";
    }
  } else {
    mockCpus = mock || "0";
    gatewayCpus = gateway || (nproc >= 4 ? "1-2" : "1");
    clientCpus = client || (nproc >= 4 ? "3" : "2");
    layoutMode = countCpuList(gatewayCpus) >= 2 ? "gateway_2core_override" : "gateway_1core_override";
  }
  return {
    enabled: true,
    nproc,
    mock_cpus: mockCpus,
    gateway_cpus: gatewayCpus,
    client_cpus: clientCpus,
    gateway_cpu_count: countCpuList(gatewayCpus),
    layout_mode: layoutMode,
    note: "Same pin layout as multiturn gateway_2core (mock unused here; CPUs reserved).",
  };
}

const CORE_LAYOUT = resolveCoreLayout();

function withTaskset(command, args, role) {
  const list =
    role === "gateway"
      ? CORE_LAYOUT.gateway_cpus
      : role === "client"
        ? CORE_LAYOUT.client_cpus
        : CORE_LAYOUT.mock_cpus;
  if (!CORE_LAYOUT.enabled || !list) return { command, args };
  if (!existsSync("/usr/bin/taskset") && !existsSync("/bin/taskset")) return { command, args };
  return { command: "taskset", args: ["-c", list, command, ...args] };
}

function maybeReexecPinnedClient() {
  if (!CORE_LAYOUT.enabled || !CORE_LAYOUT.client_cpus) return;
  if (process.env.MT_CLIENT_PINNED === "1") return;
  if (!existsSync("/usr/bin/taskset") && !existsSync("/bin/taskset")) return;
  console.error(`[echo-bisect] pinning client to CPUs ${CORE_LAYOUT.client_cpus}`);
  const child = spawnSync(
    "taskset",
    ["-c", CORE_LAYOUT.client_cpus, process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { cwd: process.cwd(), env: { ...process.env, MT_CLIENT_PINNED: "1" }, stdio: "inherit" }
  );
  process.exit(child.status ?? 1);
}

function readCpusAllowedList() {
  try {
    const st = readFileSync("/proc/self/status", "utf8");
    const m = st.match(/^Cpus_allowed_list:\s*(\S+)/m);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

function killProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* ignore */
    }
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(samples) {
  if (!samples.length) {
    return { n: 0, p50_ms: null, p95_ms: null, p99_ms: null, p999_ms: null, mean_ms: null, max_ms: null };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    p50_ms: Number(percentile(sorted, 50).toFixed(3)),
    p95_ms: Number(percentile(sorted, 95).toFixed(3)),
    p99_ms: Number(percentile(sorted, 99).toFixed(3)),
    p999_ms: Number(percentile(sorted, 99.9).toFixed(3)),
    mean_ms: Number((sum / sorted.length).toFixed(3)),
    min_ms: Number(sorted[0].toFixed(3)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(3)),
    n_ge_100ms: sorted.filter((x) => x >= 100).length,
    n_ge_200ms: sorted.filter((x) => x >= 200).length,
    n_ge_300ms: sorted.filter((x) => x >= 300).length,
  };
}

const keepAliveAgent = new Agent({
  connections: 1,
  pipelining: 1,
  keepAliveTimeout: 60_000,
  connect: buildConnector({ rejectUnauthorized: true }),
});

async function undiciKeepAlive(url, init = {}) {
  return undiciFetch(url, { ...init, dispatcher: keepAliveAgent });
}

function fetchSkipStandaloneSse(baseFetch) {
  return async (input, init) => {
    const method = (init?.method || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (method === "GET" && /\/mcp\/?(\?|$)/.test(url)) {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    return baseFetch(input, init);
  };
}

async function startEchoHttp() {
  const command = RUNTIME === "bun" ? resolveBunBin() : process.execPath;
  if (!command) throw new Error("bun not found (set BUN_BIN)");
  const args = [ECHO_SCRIPT];
  if (RUNTIME === "bun") {
    /* bun runs the script directly */
  }
  const env = {
    ...process.env,
    PORT: "0",
    CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
    CLAWQL_MCP_DISABLE_STANDALONE_SSE: "1",
    CLAWQL_MCP_JSON_BODY_LIMIT: "2mb",
  };
  const pinned = withTaskset(command, args, "gateway");
  const child = spawn(pinned.command, pinned.args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let readyInfo = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("echo-http ready timeout")), 30_000);
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += String(chunk);
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        try {
          const j = JSON.parse(line.trim());
          if (j.ready && j.mcpUrl) {
            readyInfo = j;
            clearTimeout(timer);
            resolve(j);
          }
        } catch {
          /* ignore */
        }
      }
    });
    child.stderr.on("data", (c) => {
      const s = String(c);
      if (s.includes("[echo-http]")) process.stderr.write(s);
    });
    child.on("exit", (code, signal) => {
      if (!readyInfo) {
        clearTimeout(timer);
        reject(new Error(`echo-http exited early code=${code} signal=${signal}`));
      }
    });
  });
  console.error(
    `[echo-bisect] echo pid=${readyInfo.pid} url=${readyInfo.mcpUrl}` +
      (CORE_LAYOUT.gateway_cpus ? ` cpus=${CORE_LAYOUT.gateway_cpus}` : "")
  );
  return {
    mcpUrl: readyInfo.mcpUrl,
    pid: readyInfo.pid,
    close: async () => {
      killProcessGroup(child, "SIGTERM");
      await new Promise((r) => setTimeout(r, 150));
      killProcessGroup(child, "SIGKILL");
    },
  };
}

async function main() {
  maybeReexecPinnedClient();
  if (!existsSync(ECHO_SCRIPT)) throw new Error(`missing ${ECHO_SCRIPT}`);
  await mkdir(OUT_DIR, { recursive: true });

  console.log(
    `[echo-bisect] runtime=${RUNTIME} turns=${TURNS} iters=${ITERS} rpcs/turn=${RPCS_PER_TURN}`
  );
  console.log(
    `[echo-bisect] core_layout mode=${CORE_LAYOUT.layout_mode} gateway=${CORE_LAYOUT.gateway_cpus} ` +
      `client=${CORE_LAYOUT.client_cpus} allowed=${readCpusAllowedList()}`
  );

  const gw = await startEchoHttp();
  const flowMs = [];
  const callMs = [];
  let errors = 0;

  try {
    const transport = new StreamableHTTPClientTransport(new URL(gw.mcpUrl), {
      fetch: fetchSkipStandaloneSse(undiciKeepAlive),
    });
    const client = new Client({ name: "echo-bisect", version: "1" }, {});
    await client.connect(transport);

    for (let i = 1; i <= ITERS; i++) {
      const tFlow = performance.now();
      for (let t = 1; t <= TURNS; t++) {
        for (let r = 0; r < RPCS_PER_TURN; r++) {
          const t0 = performance.now();
          try {
            const res = await client.callTool({
              name: "echo",
              arguments: { message: `f${i}-t${t}-r${r}` },
            });
            if (res?.isError) errors += 1;
          } catch {
            errors += 1;
          }
          callMs.push(performance.now() - t0);
        }
      }
      flowMs.push(performance.now() - tFlow);
      if (PROGRESS_EVERY > 0 && i % PROGRESS_EVERY === 0) {
        console.error(`[echo-bisect] flows ${i}/${ITERS}`);
      }
    }

    await client.close().catch(() => {});
  } finally {
    await gw.close();
  }

  const flow = summarize(flowMs);
  const call = summarize(callMs);
  // Reference: published gw2core clawql_http / bun if present
  let ref = null;
  try {
    const board = JSON.parse(
      readFileSync(
        join(OUT_DIR, "gateway-multi-multiturn-publish-all-arms-gw2core-10k.json"),
        "utf8"
      )
    );
    const arm = RUNTIME === "bun" ? board.board?.clawql_http_bun : board.board?.clawql_http;
    if (arm?.flow_e2e_ms) {
      ref = {
        arm: RUNTIME === "bun" ? "clawql_http_bun" : "clawql_http",
        flow_e2e_ms: arm.flow_e2e_ms,
        note: "Same host layout (gateway_2core). Compare p999 — not absolute proof across sessions.",
      };
    }
  } catch {
    /* optional */
  }

  const stackSuspect =
    flow.p999_ms != null && flow.p999_ms >= 200 && (flow.n_ge_300ms ?? 0) > 0;
  const verdict = stackSuspect
    ? "stack_suspect — echo shows rare spikes under ClawQL-shaped HTTP stack; next swap Express/sessions/middleware"
    : "stack_clean — echo tails stay tight; next add ClawQL layers until spikes return";

  const report = {
    suite: "http-stack-echo-bisect",
    measuredAt: new Date().toISOString(),
    node: process.version,
    runtime: RUNTIME,
    core_layout: { ...CORE_LAYOUT, client_cpus_allowed: readCpusAllowedList() },
    config: {
      turns: TURNS,
      iters: ITERS,
      rpcs_per_turn: RPCS_PER_TURN,
      posts_per_flow: TURNS * RPCS_PER_TURN,
      enableJsonResponse: true,
      disableStandaloneSse: true,
    },
    echo_http: {
      flow_e2e_ms: flow,
      call_ms: call,
      errors,
      ms_per_call_p50: call.p50_ms,
    },
    reference_clawql_http_gw2core: ref,
    verdict,
    honesty: [
      "Echo uses Express + MCP StreamableHTTPServerTransport (sessionful, JSON response, SSE GET 405) — same shape as ClawQL bench, not every ClawQL middleware/auth route.",
      "Host noise is unlikely: peers' HTTP tails improved with 2 cores on this machine; only ClawQL HTTP did not.",
      "If stack_suspect: swap Express→raw http / Bun.serve, then stateful→stateless, then strip middleware.",
      "If stack_clean: reintroduce ClawQL createMcpHttpApp layers until spikes return.",
    ],
  };

  await writeFile(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n[echo-bisect] wrote ${OUT_PATH}`);
  console.log(
    `flow p50/p999=${flow.p50_ms}/${flow.p999_ms} call p50/p999=${call.p50_ms}/${call.p999_ms} ` +
      `n≥300ms=${flow.n_ge_300ms} errors=${errors}`
  );
  if (ref) {
    console.log(
      `ref ${ref.arm} flow p50/p999=${ref.flow_e2e_ms.p50_ms}/${ref.flow_e2e_ms.p999_ms}`
    );
  }
  console.log(`verdict: ${verdict}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
