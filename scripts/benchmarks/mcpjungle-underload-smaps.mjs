/**
 * MCPJungle under-load smaps (RSS / anon / PSS) on equal-arm fat catalog MCP.
 *
 *   N=800 CATALOG_TOOL_COUNT=40 node scripts/benchmarks/mcpjungle-underload-smaps.mjs
 *   N=400 CATALOG_TOOL_COUNT=209 OUT=.../mcpjungle-underload-sentry-count.json \
 *     node scripts/benchmarks/mcpjungle-underload-smaps.mjs
 *
 * Compares like-for-like with catalog-sqlite-underload-* (anon vs anon).
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync, openSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = "/workspace";
const OUT = process.env.OUT || "/opt/cursor/artifacts/mcpjungle-underload-smaps.json";
// Publish-board MJ tree RSS climbs ~110→153 over tens of thousands of calls
// (catalog Node child grows). Default N matches that plateau, not a short Ready sample.
const N = Math.max(50, Number(process.env.N || 40000) || 40000);
const WARMUP = Math.max(5, Number(process.env.WARMUP || 50) || 50);
const SAMPLE_EVERY = Math.max(10, Number(process.env.SAMPLE_EVERY || 500) || 500);
/** Prefer last PLATEAU_TAIL samples for under-load medians (post-climb). */
const PLATEAU_TAIL = Math.max(5, Number(process.env.PLATEAU_TAIL || 20) || 20);
const TOOL_COUNT = Math.max(4, Math.min(250, Number(process.env.CATALOG_TOOL_COUNT || 40) || 40));
const MCPJUNGLE = process.env.MCPJUNGLE_BIN || "/tmp/gw-bins/mcpjungle";
const CATALOG_MCP = join(ROOT, "scripts/benchmarks/lib/equal-arm-catalog-mcp.mjs");
const USE_TASKSET = !["0", "false", "no"].includes(
  (process.env.USE_TASKSET ?? "1").trim().toLowerCase()
);

function pickPort() {
  return new Promise((resolveP, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolveP(port));
    });
    s.on("error", reject);
  });
}

async function waitHttpOk(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404 || r.status === 401) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`http timeout ${url}`);
}

function smapsRollup(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number(m[1]) : null;
  };
  const rss = get("Rss");
  const anon = get("Anonymous");
  const pss = get("Pss");
  return {
    rss_mb: rss != null ? Number((rss / 1024).toFixed(2)) : null,
    anonymous_mb: anon != null ? Number((anon / 1024).toFixed(2)) : null,
    pss_mb: pss != null ? Number((pss / 1024).toFixed(2)) : null,
    file_backed_est_mb:
      rss != null && anon != null ? Number(((rss - anon) / 1024).toFixed(2)) : null,
  };
}

/** Match multiturn ResourceSampler: /proc PPID scan (Go's children file is often empty). */
function childPids(pid) {
  const out = [];
  try {
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const stat = readFileSync(`/proc/${d}/stat`, "utf8");
        const rp = stat.lastIndexOf(")");
        const ppid = Number(stat.slice(rp + 2).split(/\s+/)[1]);
        if (ppid === pid) out.push(Number(d));
      } catch {
        /* race */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function processTreePids(rootPid) {
  if (!rootPid) return [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const p = queue.shift();
    for (const c of childPids(p)) {
      if (!seen.has(c)) {
        seen.add(c);
        queue.push(c);
      }
    }
  }
  return [...seen];
}

function treeSmaps(rootPid) {
  // Resolve mcpjungle under taskset: spawn pid may be taskset; prefer binary pid.
  let gwPid = rootPid;
  try {
    const cmd = readFileSync(`/proc/${rootPid}/cmdline`, "utf8");
    if (cmd.includes("taskset")) {
      const kids = childPids(rootPid);
      const mj = kids.find((p) => {
        try {
          return readFileSync(`/proc/${p}/cmdline`, "utf8").includes("mcpjungle");
        } catch {
          return false;
        }
      });
      if (mj) gwPid = mj;
    }
  } catch {
    /* keep root */
  }
  const pids = processTreePids(gwPid);
  const parts = [];
  let rss = 0;
  let anon = 0;
  let pss = 0;
  for (const pid of pids) {
    const s = smapsRollup(pid);
    if (!s) continue;
    let cmdline = "";
    try {
      cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim().slice(0, 120);
    } catch {
      /* ignore */
    }
    parts.push({ pid, cmdline, ...s });
    if (s.rss_mb != null) rss += s.rss_mb;
    if (s.anonymous_mb != null) anon += s.anonymous_mb;
    if (s.pss_mb != null) pss += s.pss_mb;
  }
  return {
    root_pid: rootPid,
    gateway_pid: gwPid,
    pids,
    parts,
    tree: {
      rss_mb: Number(rss.toFixed(2)),
      anonymous_mb: Number(anon.toFixed(2)),
      pss_mb: Number(pss.toFixed(2)),
      file_backed_est_mb: Number((rss - anon).toFixed(2)),
    },
    gateway_only: smapsRollup(gwPid),
  };
}

function summarize(samples, keyPath) {
  const vals = samples
    .map((s) => {
      let cur = s;
      for (const k of keyPath) cur = cur?.[k];
      return cur;
    })
    .filter((x) => x != null)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return {
    min: vals[0],
    median: vals[Math.floor(vals.length / 2)],
    max: vals[vals.length - 1],
    n: vals.length,
  };
}

if (!existsSync(MCPJUNGLE)) throw new Error(`MCPJUNGLE_BIN missing: ${MCPJUNGLE}`);
if (!existsSync(CATALOG_MCP)) throw new Error(`missing ${CATALOG_MCP}`);

const work = join(tmpdir(), `mj-smaps-${process.pid}`);
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
const port = await pickPort();
const dbPath = join(work, "mcpjungle.db");
const confPath = join(work, "catalog-stdio.json");
await writeFile(
  confPath,
  JSON.stringify(
    {
      name: "catalog",
      transport: "stdio",
      description: "equal-arm fat catalog MCP",
      command: process.execPath,
      args: [CATALOG_MCP],
      session_mode: "stateful",
      env: { CATALOG_TOOL_COUNT: String(TOOL_COUNT) },
    },
    null,
    2
  )
);

const logPath = join(work, "server.log");
const logFd = openSync(logPath, "w");
let cmd = MCPJUNGLE;
let args = ["start", "--host", "127.0.0.1", "--port", String(port), "--sqlite-db-path", dbPath];
if (USE_TASKSET) {
  args = ["-c", "2,3", cmd, ...args];
  cmd = "taskset";
}
const child = spawn(cmd, args, {
  cwd: work,
  stdio: ["ignore", logFd, logFd],
  env: { ...process.env },
  detached: true,
});

const registry = `http://127.0.0.1:${port}`;
try {
  await waitHttpOk(`${registry}/`, 60000);
  const reg = spawnSync(
    MCPJUNGLE,
    ["register", "-c", confPath, "--registry", registry, "--force"],
    { encoding: "utf8", cwd: work }
  );
  if (reg.status !== 0) {
    throw new Error(`register failed: ${reg.stderr || reg.stdout}\n${readFileSync(logPath, "utf8").slice(-1500)}`);
  }

  // settle children
  await new Promise((r) => setTimeout(r, 800));
  const ready = treeSmaps(child.pid);

  const transport = new StreamableHTTPClientTransport(new URL(`${registry}/mcp`));
  const client = new Client({ name: "mj-smaps", version: "1" }, {});
  await client.connect(transport);
  // listTools materializes the fat schema surface (publish board Ready→~150 climb).
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name).filter(Boolean);
  if (!toolNames.length) throw new Error("no tools registered");
  await new Promise((r) => setTimeout(r, 1500));
  const afterList = treeSmaps(child.pid);

  for (let i = 0; i < WARMUP; i++) {
    const name = toolNames[i % toolNames.length];
    await client.callTool({ name, arguments: { limit: 25 } });
  }

  const samples = [];
  const callMs = [];
  for (let i = 0; i < N; i++) {
    // Rotate tools like multiturn (12 partitions) so schemas stay hot.
    const name = toolNames[i % toolNames.length];
    const t0 = performance.now();
    await client.callTool({ name, arguments: { limit: 25 } });
    callMs.push(performance.now() - t0);
    if (i % SAMPLE_EVERY === 0 || i === N - 1) {
      samples.push({ flow: i + 1, ...treeSmaps(child.pid) });
    }
  }

  await client.close().catch(() => {});

  const sorted = [...callMs].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  const plateau = samples.slice(-Math.min(PLATEAU_TAIL, samples.length));

  const out = {
    measuredAt: new Date().toISOString(),
    arm: "mcpjungle",
    tool_count: TOOL_COUNT,
    n: N,
    warmup: WARMUP,
    tools_listed: toolNames.length,
    after_list_tools: afterList,
    ready,
    under_load: {
      gateway_rss: summarize(samples, ["gateway_only", "rss_mb"]),
      gateway_anon: summarize(samples, ["gateway_only", "anonymous_mb"]),
      gateway_pss: summarize(samples, ["gateway_only", "pss_mb"]),
      tree_rss: summarize(samples, ["tree", "rss_mb"]),
      tree_anon: summarize(samples, ["tree", "anonymous_mb"]),
      tree_pss: summarize(samples, ["tree", "pss_mb"]),
      samples_n: samples.length,
      last: samples[samples.length - 1] ?? null,
    },
    under_load_plateau: {
      note: `Last ${plateau.length} samples (post-climb); compare to publish-board ~152 RSS`,
      gateway_rss: summarize(plateau, ["gateway_only", "rss_mb"]),
      gateway_anon: summarize(plateau, ["gateway_only", "anonymous_mb"]),
      tree_rss: summarize(plateau, ["tree", "rss_mb"]),
      tree_anon: summarize(plateau, ["tree", "anonymous_mb"]),
      tree_pss: summarize(plateau, ["tree", "pss_mb"]),
      last: plateau[plateau.length - 1] ?? null,
    },
    call: {
      n: callMs.length,
      p50_ms: Number(pct(50).toFixed(3)),
      p99_ms: Number(pct(99).toFixed(3)),
      p999_ms: Number(pct(99.9).toFixed(3)),
    },
    interpretation:
      "Publish-board MJ ~152 MB is tree RSS (ResourceSampler /proc PPID tree). " +
      "Quote under_load_plateau.tree_anon vs ClawQL process anon (smaps Anonymous). " +
      "gateway_only is the Go multiplexer; catalog Node child dominates tree growth.",
  };

  await mkdir("/opt/cursor/artifacts", { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  try {
    closeSync(logFd);
  } catch {
    /* ignore */
  }
}
