#!/usr/bin/env node
/**
 * Wall-clock interleave: round-robin 12-turn flows across ClawQL Bun HTTP + MCPJungle.
 * Records slow flows with t_iso to test host-wide vs in-process stalls.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, openSync, closeSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = "/workspace";
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const MCPJUNGLE = process.env.MCPJUNGLE_BIN || "/tmp/gw-bins/mcpjungle";
const CATALOG_MCP = join(ROOT, "scripts/benchmarks/lib/equal-arm-catalog-mcp.mjs");
const FLOWS = Math.max(200, Number(process.env.STALL_FLOWS || 2000) || 2000);
const SLOW_MS = Number(process.env.STALL_SLOW_MS || 80) || 80;
const TOOL_COUNT = 40;
const TURNS = 12;
const OUT = process.env.STALL_OUT || "/opt/cursor/artifacts/interleaved-stall-probe.json";

const { clawqlEqualArmEnv } = await import(
  join(ROOT, "scripts/benchmarks/lib/clawql-bench-env.mjs")
);

function pickPort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitTcp(port, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        resolve(true);
      });
      c.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`tcp :${port}`);
}

async function waitHttpOk(url, { timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`http timeout ${url}`);
}

function killTree(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

function toolText(res) {
  return (res?.content || []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
}

function toolName(i) {
  return `catalog_list_${String(i).padStart(3, "0")}`;
}

async function mcpConnect(url, name) {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  return {
    client,
    close: async () => {
      try {
        await transport.terminateSession?.();
      } catch {}
      await client.close().catch(() => {});
    },
  };
}

const home = join(tmpdir(), `stall-${process.pid}`);
await mkdir(home, { recursive: true });

// Minimal mock only needed for ClawQL OpenAPI execute; catalog MCP is stdio behind mcpjungle.
const mockPort = await pickPort();
const mock = createHttpServer((req, res) => {
  const u = new URL(req.url || "/", "http://x");
  const limit = Math.min(50, Number(u.searchParams.get("limit") || 10) || 10);
  const items = [];
  for (let i = 1; i <= limit; i++) {
    items.push({
      id: i,
      name: i === 1 ? "Ada" : i === 2 ? "Grace" : `Pet${i}`,
      status: "available",
      meta: "x".repeat(120),
    });
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ items }));
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));
const baseUrl = `http://127.0.0.1:${mockPort}`;

const paths = {};
for (let i = 1; i <= TOOL_COUNT; i++) {
  const id = toolName(i);
  paths[`/${id}`] = {
    get: {
      operationId: id,
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer" } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "includeMeta", in: "query", schema: { type: "boolean" } },
      ],
      responses: { "200": { description: "ok" } },
    },
  };
}
const specPath = join(home, "spec.json");
await writeFile(
  specPath,
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "stall", version: "1" },
    servers: [{ url: baseUrl }],
    paths,
  })
);

const turns = [];
for (let n = 1; n <= TURNS; n++) {
  const op = toolName(((n - 1) % TOOL_COUNT) + 1);
  turns.push({
    n,
    operationId: op,
    tool: op,
    query: `${op} partition ${n} inventory list entities`,
    args: { limit: 10, status: "any", includeMeta: true },
    where: "items",
    fields: ["id", "name", "status"],
  });
}

const cleanups = [];

// --- ClawQL Bun HTTP ---
const clawPort = await pickPort();
const clawEnv = {
  ...clawqlEqualArmEnv({ home: join(home, "clawql"), specPath, apiBase: baseUrl }),
  PORT: String(clawPort),
  MCP_PORT: String(clawPort),
  MCP_HOST: "127.0.0.1",
  CLAWQL_AUTH_MODE: "noAuth",
  CLAWQL_MCP_JSON_BODY_LIMIT: "2mb",
  CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  CLAWQL_MCP_DISABLE_STANDALONE_SSE: "1",
  CLAWQL_HTTP_SKIP_GRAPHQL: "1",
  CLAWQL_ENABLE_HTTP_METRICS: "0",
  CLAWQL_HTTP_SKIP_PAYMENTS: "1",
};
const clawChild = spawn(BUN, ["--smol", join(ROOT, "dist/server-http.js")], {
  cwd: ROOT,
  env: clawEnv,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
cleanups.push(() => killTree(clawChild.pid));
{
  let log = "";
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("clawql listen\n" + log.slice(-600))), 90000);
    const on = (c) => {
      log += c;
      if (log.includes("listening on")) {
        clearTimeout(t);
        setTimeout(resolve, 300);
      }
    };
    clawChild.stderr.on("data", on);
    clawChild.stdout.on("data", on);
    clawChild.on("exit", (code) => reject(new Error("clawql exit " + code)));
  });
  await waitTcp(clawPort);
}
const clawConn = await mcpConnect(`http://127.0.0.1:${clawPort}/mcp`, "stall-claw");
cleanups.push(() => clawConn.close());

// --- MCPJungle ---
if (!existsSync(MCPJUNGLE)) throw new Error("MCPJUNGLE_BIN missing");
if (!existsSync(CATALOG_MCP)) throw new Error("catalog mcp missing");
const mjWork = join(home, "mcpjungle");
await mkdir(mjWork, { recursive: true });
const mjPort = await pickPort();
const confPath = join(mjWork, "catalog-stdio.json");
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
const mjLog = join(mjWork, "server.log");
const mjFd = openSync(mjLog, "w");
const mjChild = spawn(
  MCPJUNGLE,
  ["start", "--host", "127.0.0.1", "--port", String(mjPort), "--sqlite-db-path", join(mjWork, "db")],
  { cwd: mjWork, stdio: ["ignore", mjFd, mjFd], env: { ...process.env }, detached: true }
);
cleanups.push(() => {
  killTree(mjChild.pid);
  try {
    closeSync(mjFd);
  } catch {}
});
const mjRegistry = `http://127.0.0.1:${mjPort}`;
await waitHttpOk(`${mjRegistry}/`, { timeoutMs: 60000 });
const reg = spawnSync(
  MCPJUNGLE,
  ["register", "-c", confPath, "--registry", mjRegistry, "--force"],
  { encoding: "utf8", cwd: mjWork }
);
if (reg.status !== 0) {
  throw new Error(`mcpjungle register failed: ${reg.stderr || reg.stdout}\n${readFileSync(mjLog, "utf8").slice(-1500)}`);
}
const mjConn = await mcpConnect(`${mjRegistry}/mcp`, "stall-mj");
cleanups.push(() => mjConn.close());
const mjTools = await mjConn.client.listTools();
const nameMap = new Map();
for (const t of mjTools.tools || []) {
  for (let i = 1; i <= TOOL_COUNT; i++) {
    const base = toolName(i);
    if (t.name === base || t.name.endsWith(base) || t.name.includes(base)) nameMap.set(base, t.name);
  }
}
const resolveMj = (base) => nameMap.get(base) || `catalog__${base}`;

const arms = [
  {
    id: "clawql_http_bun",
    async runFlow() {
      for (const turn of turns) {
        const s = await clawConn.client.callTool({
          name: "search",
          arguments: { query: turn.query, limit: 3 },
        });
        if (s.isError) throw new Error(toolText(s).slice(0, 200));
        const e = await clawConn.client.callTool({
          name: "execute",
          arguments: {
            operationId: turn.operationId,
            args: turn.args,
            where: turn.where,
            fields: turn.fields,
          },
        });
        if (e.isError) throw new Error(toolText(e).slice(0, 200));
      }
    },
  },
  {
    id: "mcpjungle",
    async runFlow() {
      for (const turn of turns) {
        const res = await mjConn.client.callTool({
          name: resolveMj(turn.tool),
          arguments: turn.args,
        });
        if (res.isError) throw new Error(toolText(res).slice(0, 200));
      }
    },
  },
];

console.error(`[stall] arms=${arms.map((a) => a.id).join(",")} flows=${FLOWS} slow≥${SLOW_MS}ms`);

const slowByArm = Object.fromEntries(arms.map((a) => [a.id, []]));
const latByArm = Object.fromEntries(arms.map((a) => [a.id, []]));
const t0 = Date.now();

for (let i = 1; i <= FLOWS; i++) {
  for (const arm of arms) {
    const wall0 = Date.now();
    const tFlow = performance.now();
    let err = null;
    try {
      await arm.runFlow();
    } catch (e) {
      err = String(e?.message || e).slice(0, 180);
    }
    const ms = performance.now() - tFlow;
    latByArm[arm.id].push(ms);
    if (ms >= SLOW_MS) {
      slowByArm[arm.id].push({
        flow: i,
        ms: Number(ms.toFixed(1)),
        t_iso: new Date(wall0).toISOString(),
        t_end_iso: new Date().toISOString(),
        err,
      });
    }
  }
  if (i % 100 === 0 || i === FLOWS) {
    console.error(`[stall] ${i}/${FLOWS} elapsed_s=${((Date.now() - t0) / 1000).toFixed(1)}`);
  }
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return Number(s[idx].toFixed(3));
}

function overlaps(a, b, slackMs = 250) {
  const a0 = Date.parse(a.t_iso) - slackMs;
  const a1 = Date.parse(a.t_end_iso) + slackMs;
  const b0 = Date.parse(b.t_iso);
  const b1 = Date.parse(b.t_end_iso);
  return a0 <= b1 && b0 <= a1;
}

const claw = slowByArm.clawql_http_bun;
const mj = slowByArm.mcpjungle;
let clawHitMj = 0;
for (const c of claw) if (mj.some((p) => overlaps(c, p))) clawHitMj++;
let mjHitClaw = 0;
for (const p of mj) if (claw.some((c) => overlaps(p, c))) mjHitClaw++;

const clawGaps = [];
{
  const times = claw.map((r) => Date.parse(r.t_iso)).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) clawGaps.push((times[i] - times[i - 1]) / 1000);
}
const gapHist = {};
for (const g of clawGaps) {
  const k = Math.round(g);
  gapHist[k] = (gapHist[k] || 0) + 1;
}

const report = {
  measuredAt: new Date().toISOString(),
  schedule: "round_robin_flow_interleave",
  flows: FLOWS,
  turns_per_flow: TURNS,
  slow_ms: SLOW_MS,
  elapsed_s: Number(((Date.now() - t0) / 1000).toFixed(1)),
  summary: Object.fromEntries(
    arms.map((a) => {
      const lat = latByArm[a.id];
      return [
        a.id,
        {
          n: lat.length,
          p50_ms: pct(lat, 50),
          p999_ms: pct(lat, 99.9),
          max_ms: lat.length ? Number(Math.max(...lat).toFixed(1)) : null,
          slow_n: slowByArm[a.id].length,
          slow_top: [...slowByArm[a.id]].sort((x, y) => y.ms - x.ms).slice(0, 12),
        },
      ];
    })
  ),
  coincidence: {
    claw_slow: claw.length,
    mcpjungle_slow: mj.length,
    claw_overlapping_mcpjungle: clawHitMj,
    claw_overlap_fraction: claw.length ? Number((clawHitMj / claw.length).toFixed(3)) : null,
    mcpjungle_overlapping_claw: mjHitClaw,
    mcpjungle_overlap_fraction: mj.length ? Number((mjHitClaw / mj.length).toFixed(3)) : null,
    interpretation:
      "High claw_overlap_fraction → shared host stalls. Near 0 with claw_slow≫peer → ClawQL-in-process.",
  },
  clawql_gap_seconds: clawGaps.map((g) => Number(g.toFixed(2))),
  clawql_gap_histogram_1s: gapHist,
};

await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

for (const fn of cleanups.reverse()) {
  try {
    await fn();
  } catch {}
}
mock.close();
await rm(home, { recursive: true, force: true }).catch(() => {});
setTimeout(() => process.exit(0), 200);
