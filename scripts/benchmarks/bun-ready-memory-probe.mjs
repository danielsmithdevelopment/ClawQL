#!/usr/bin/env node
/**
 * Start Bun HTTP equal-arm MCP, at Ready dump:
 * - /proc/pid/smaps_rollup (anon vs file)
 * - top anonymous / file-backed mappings from smaps
 * - Bun.generateHeapSnapshot retained-size top nodes (best-effort)
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/workspace";
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const OUT = process.env.MEM_OUT || "/opt/cursor/artifacts/bun-ready-memory.json";

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

function parseSmapsRollup(pid) {
  const p = `/proc/${pid}/smaps_rollup`;
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const get = (k) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s+kB`, "m"));
    return m ? Number(m[1]) : null;
  };
  return {
    rss_kb: get("Rss"),
    pss_kb: get("Pss"),
    shared_clean_kb: get("Shared_Clean"),
    shared_dirty_kb: get("Shared_Dirty"),
    private_clean_kb: get("Private_Clean"),
    private_dirty_kb: get("Private_Dirty"),
    referenced_kb: get("Referenced"),
    anonymous_kb: get("Anonymous"),
    lazy_free_kb: get("LazyFree"),
    anon_huge_kb: get("AnonHugePages"),
    swap_kb: get("Swap"),
    locked_kb: get("Locked"),
  };
}

function parseSmapsTop(pid, limit = 25) {
  const p = `/proc/${pid}/smaps`;
  if (!existsSync(p)) return { anon: [], file: [] };
  const text = readFileSync(p, "utf8");
  const blocks = text.split(/\n(?=[0-9a-f]+-[0-9a-f]+ )/i);
  const rows = [];
  for (const b of blocks) {
    const head = b.split("\n")[0] || "";
    const rssM = b.match(/^Rss:\s+(\d+)\s+kB/m);
    const anonM = b.match(/^Anonymous:\s+(\d+)\s+kB/m);
    if (!rssM) continue;
    const rss = Number(rssM[1]);
    if (rss < 256) continue; // skip tiny
    const path = head.split(/\s+/).slice(5).join(" ") || "[anon]";
    const anon = anonM ? Number(anonM[1]) : 0;
    rows.push({ rss_kb: rss, anon_kb: anon, path });
  }
  const anon = [...rows]
    .filter((r) => r.anon_kb > 0 || r.path === "[anon]" || r.path.includes("[heap]") || r.path.includes("anon"))
    .sort((a, b) => b.anon_kb - a.anon_kb || b.rss_kb - a.rss_kb)
    .slice(0, limit);
  const file = [...rows]
    .filter((r) => r.path.startsWith("/") && r.anon_kb < r.rss_kb)
    .sort((a, b) => b.rss_kb - a.rss_kb)
    .slice(0, limit);
  return { anon, file };
}

const home = join(tmpdir(), `mem-probe-${process.pid}`);
await mkdir(home, { recursive: true });
const port = await pickPort();
const mockPort = await pickPort();
const mock = createHttpServer((_q, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end('{"items":[]}');
});
await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));
const specPath = join(home, "spec.json");
const paths = {};
for (let i = 1; i <= 40; i++) {
  paths[`/p${i}`] = {
    get: { operationId: `op${i}`, responses: { "200": { description: "ok" } } },
  };
}
await writeFile(
  specPath,
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "mem", version: "1" },
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
  CLAWQL_HTTP_SKIP_PAYMENTS: "1",
  // Child dumps heap after listen via loader
  CLAWQL_HEAP_SNAP_PATH: join(home, "heap.json"),
  CLAWQL_HEAP_REPORT_PATH: join(home, "heap-report.json"),
};

const loader = join(home, "loader.mjs");
await writeFile(
  loader,
  `
const entry = ${JSON.stringify(join(ROOT, "dist/server-http.js"))};
const snapPath = process.env.CLAWQL_HEAP_SNAP_PATH;
const reportPath = process.env.CLAWQL_HEAP_REPORT_PATH;
await import(entry);
// wait for listen log from entry (side effect)
await Bun.sleep(1500);
const rss = process.memoryUsage();
let heapReport = { error: "no snapshot" };
try {
  const heap = Bun.generateHeapSnapshot();
  // Bun heap snapshot format: { version, type, nodes, edges, strings, ... }
  // nodes may be a flat number array — use built-in summary if present
  const strings = heap.strings || [];
  const nodes = heap.nodes;
  const nodeCount = Array.isArray(nodes) ? (typeof nodes[0] === "object" ? nodes.length : Math.floor(nodes.length / (heap.nodeFieldCount || 1))) : 0;
  // Package string hits
  const interesting = [
    "clawql-api","clawql-core","clawql-auth","effect","zod","express",
    "@modelcontextprotocol","tiktoken","openai","@opentelemetry","graphql",
    "clawql-payments","clawql-memory","clawql-inference","viem","undici"
  ];
  const hits = {};
  for (const s of strings) {
    if (typeof s !== "string") continue;
    for (const p of interesting) if (s.includes(p)) hits[p] = (hits[p] || 0) + 1;
  }
  // Retained size: Bun exposes node sizes in nodes typed array — use edge/self if available
  // Prefer heap.nodes as objects when present
  let top = [];
  if (Array.isArray(nodes) && nodes.length && typeof nodes[0] === "object") {
    top = [...nodes]
      .map((n, i) => ({
        i,
        type: n.type,
        name: typeof n.name === "number" ? strings[n.name] : n.name,
        self: n.selfSize ?? n.self_size ?? 0,
        retained: n.retainedSize ?? n.retained_size ?? 0,
      }))
      .sort((a, b) => (b.retained || b.self) - (a.retained || a.self))
      .slice(0, 40);
  }
  heapReport = {
    rss,
    stringCount: strings.length,
    nodeCount,
    packageStringHits: Object.fromEntries(Object.entries(hits).sort((a,b)=>b[1]-a[1])),
    topRetained: top,
    keys: Object.keys(heap),
    nodeFieldCount: heap.nodeFieldCount,
    edgeFieldCount: heap.edgeFieldCount,
  };
  // Don't write full snap (huge) — report only
  await Bun.write(reportPath, JSON.stringify(heapReport, null, 2));
} catch (e) {
  heapReport = { error: String(e), rss };
  await Bun.write(reportPath, JSON.stringify(heapReport, null, 2));
}
console.error("[mem-loader] heap report written");
await Bun.sleep(60000); // parent samples smaps then kills
`
);

const child = spawn(BUN, ["--smol", loader], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

let log = "";
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("timeout\n" + log.slice(-800))), 90000);
  const on = (c) => {
    log += c;
    process.stderr.write(c);
    if (log.includes("listening on") || log.includes("heap report written")) {
      clearTimeout(t);
      setTimeout(resolve, 600);
    }
  };
  child.stderr.on("data", on);
  child.stdout.on("data", on);
  child.on("exit", (code) => {
    clearTimeout(t);
    if (!log.includes("listening on") && !existsSync(env.CLAWQL_HEAP_REPORT_PATH)) {
      reject(new Error("exit " + code + "\n" + log.slice(-800)));
    }
  });
});

try {
  await waitTcp(port);
} catch {
  /* loader may still be up */
}

await new Promise((r) => setTimeout(r, 500));
const rollup = parseSmapsRollup(child.pid);
const topMaps = parseSmapsTop(child.pid);
let heapReport = null;
try {
  heapReport = JSON.parse(await readFile(env.CLAWQL_HEAP_REPORT_PATH, "utf8"));
} catch (e) {
  heapReport = { error: String(e), log_tail: log.slice(-1000) };
}

const report = {
  measuredAt: new Date().toISOString(),
  pid: child.pid,
  skip_payments: env.CLAWQL_HTTP_SKIP_PAYMENTS,
  smaps_rollup: rollup
    ? {
        ...rollup,
        rss_mb: rollup.rss_kb != null ? Number((rollup.rss_kb / 1024).toFixed(2)) : null,
        anonymous_mb:
          rollup.anonymous_kb != null ? Number((rollup.anonymous_kb / 1024).toFixed(2)) : null,
        private_dirty_mb:
          rollup.private_dirty_kb != null
            ? Number((rollup.private_dirty_kb / 1024).toFixed(2))
            : null,
        // file-backed ≈ rss - anonymous (rough)
        file_backed_est_mb:
          rollup.rss_kb != null && rollup.anonymous_kb != null
            ? Number(((rollup.rss_kb - rollup.anonymous_kb) / 1024).toFixed(2))
            : null,
      }
    : null,
  top_anon_mappings: topMaps.anon,
  top_file_mappings: topMaps.file,
  heap: heapReport,
  note:
    "anonymous ≈ heap/data structures; file-backed ≈ mapped code/binaries. " +
    "If anonymous dominates the post-import 145MB, chase eager caches.",
};

await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

try {
  process.kill(-child.pid, "SIGTERM");
} catch {
  try {
    child.kill("SIGTERM");
  } catch {}
}
mock.close();
setTimeout(() => process.exit(0), 200);
