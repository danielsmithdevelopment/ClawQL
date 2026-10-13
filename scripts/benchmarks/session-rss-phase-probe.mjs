/**
 * Phase RSS for Bun HTTP: listen → connect → load → terminateSession → settle.
 * Samples /healthz?bench when CLAWQL_BENCH_STATS=1.
 *
 *   node scripts/benchmarks/session-rss-phase-probe.mjs
 *   MT_HTTP_SESSION_PER_FLOW=1 FLOWS=40 node scripts/benchmarks/session-rss-phase-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ROOT = "/workspace";
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const FLOWS = Math.max(5, Number(process.env.FLOWS || 40) || 40);
const TURNS = 12;
const OUT = process.env.OUT || "/opt/cursor/artifacts/session-rss-phase.json";
const SESSION_PER_FLOW = ["1", "true", "yes"].includes(
  (process.env.MT_HTTP_SESSION_PER_FLOW ?? "").trim().toLowerCase()
);

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
  throw new Error("tcp timeout");
}

function rssMb(pid) {
  try {
    const m = readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)\s+kB/m);
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null;
  }
}

async function healthz(port) {
  const r = await fetch(`http://127.0.0.1:${port}/healthz`);
  return r.json();
}

const home = join(tmpdir(), `sess-rss-${process.pid}`);
await mkdir(home, { recursive: true });
const port = await pickPort();
const mockPort = await pickPort();
const mock = createHttpServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    name: `Entity-${i + 1}`,
    status: "available",
    partition: Number(new URL(req.url, "http://x").searchParams.get("partition") || 1),
  }));
  res.end(JSON.stringify({ items }));
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));

const paths = {};
for (let i = 1; i <= 40; i++) {
  const op = `catalog_list_${String(i).padStart(3, "0")}`;
  paths[`/catalog/${i}`] = {
    get: {
      operationId: op,
      parameters: [
        { name: "limit", in: "query", schema: { type: "integer" } },
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "partition", in: "query", schema: { type: "integer" } },
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
    info: { title: "fat", version: "1" },
    servers: [{ url: `http://127.0.0.1:${mockPort}` }],
    paths,
  })
);

const env = {
  ...clawqlEqualArmEnv({ home, specPath, apiBase: `http://127.0.0.1:${mockPort}` }),
  PORT: String(port),
  MCP_PORT: String(port),
  MCP_HOST: "127.0.0.1",
  CLAWQL_AUTH_MODE: "noAuth",
  CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  CLAWQL_MCP_DISABLE_STANDALONE_SSE: "1",
  CLAWQL_HTTP_SKIP_GRAPHQL: "1",
  CLAWQL_ENABLE_HTTP_METRICS: "0",
  CLAWQL_BENCH_STATS: "1",
  CLAWQL_TIMER_TRACE: process.env.CLAWQL_TIMER_TRACE || "0",
  CLAWQL_MCP_SESSION_IDLE_MS: process.env.CLAWQL_MCP_SESSION_IDLE_MS || "0",
};
if (process.env.UV_THREADPOOL_SIZE) env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE;

const child = spawn(BUN, ["--smol", join(ROOT, "dist/server-http.js")], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let log = "";
child.stderr?.on("data", (c) => {
  log += c;
  process.stderr.write(c);
});
child.stdout?.on("data", (c) => {
  log += c;
  process.stderr.write(c);
});
await waitTcp(port, 60000);
await new Promise((r) => setTimeout(r, 400));

const phases = [];
const snap = async (phase) => {
  const hz = await healthz(port);
  phases.push({
    phase,
    t: new Date().toISOString(),
    proc_rss_mb: rssMb(child.pid),
    bench: hz.bench ?? null,
  });
};

await snap("listen");

async function connect() {
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Accept: "application/json, text/event-stream" } },
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("accept") === "text/event-stream") {
        return new Response(null, { status: 405, headers: { Allow: "POST, DELETE" } });
      }
      return fetch(url, init);
    },
  });
  const client = new Client({ name: "sess-rss", version: "1" }, {});
  await client.connect(transport);
  return { client, transport };
}

let { client, transport } = await connect();
await snap("after_connect");
await client.listTools();
await snap("after_list_tools");

const slow = [];
for (let f = 1; f <= FLOWS; f++) {
  const t0 = performance.now();
  for (let t = 1; t <= TURNS; t++) {
    const op = `catalog_list_${String(((t - 1) % 40) + 1).padStart(3, "0")}`;
    await client.callTool({
      name: "search",
      arguments: { query: `${op} partition ${t} inventory`, limit: 3 },
    });
    await client.callTool({
      name: "execute",
      arguments: {
        operationId: op,
        args: { limit: 25, status: "available", includeMeta: false, partition: t },
        where: { status: "available" },
        fields: ["id", "name", "status"],
      },
    });
  }
  const ms = performance.now() - t0;
  if (ms >= 80) slow.push({ flow: f, ms: Number(ms.toFixed(1)), t: new Date().toISOString() });
  if (SESSION_PER_FLOW) {
    try {
      await transport.terminateSession?.();
    } catch {
      /* ignore */
    }
    await client.close().catch(() => {});
    ({ client, transport } = await connect());
  }
  if (f === 1 || f === FLOWS || f % Math.max(1, Math.floor(FLOWS / 4)) === 0) {
    await snap(`flow_${f}`);
  }
}

await snap("before_terminate");
try {
  await transport.terminateSession?.();
} catch {
  /* ignore */
}
await client.close().catch(() => {});
await new Promise((r) => setTimeout(r, 500));
await snap("after_terminate_500ms");
await new Promise((r) => setTimeout(r, 2000));
await snap("after_terminate_2500ms");

try {
  process.kill(-child.pid, "SIGTERM");
} catch {
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    /* ignore */
  }
}
mock.close();

const out = {
  measuredAt: new Date().toISOString(),
  flows: FLOWS,
  session_per_flow: SESSION_PER_FLOW,
  slow_flows: slow,
  phases,
  interpretation:
    "If after_terminate ≈ listen and mid-run mcp_sessions stays 1, session pileup is not the load delta. " +
    "If after_terminate drops toward listen, session-retained state dominates under-load RSS.",
};
await mkdir(join(OUT, ".."), { recursive: true }).catch(() => {});
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
if (!existsSync(OUT)) throw new Error("write failed");
