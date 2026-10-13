/**
 * Same Bun HTTP Ready path, lean vs fat OpenAPI catalog — listen RSS + smaps + inventory.
 *
 *   node scripts/benchmarks/catalog-listen-rss-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/workspace";
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const OUT = process.env.OUT || "/opt/cursor/artifacts/catalog-listen-rss.json";
const TOOL_COUNT = Math.max(4, Number(process.env.CATALOG_TOOL_COUNT || 40) || 40);

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

async function waitTcp(port, ms = 30000) {
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
    return m ? Number((Number(m[1]) / 1024).toFixed(2)) : null;
  } catch {
    return null;
  }
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
  return {
    rss_mb: rss != null ? Number((rss / 1024).toFixed(2)) : null,
    anonymous_mb: anon != null ? Number((anon / 1024).toFixed(2)) : null,
    file_backed_est_mb:
      rss != null && anon != null ? Number(((rss - anon) / 1024).toFixed(2)) : null,
  };
}

function buildSpec(kind, baseUrl) {
  const paths = {};
  if (kind === "lean") {
    for (let i = 1; i <= TOOL_COUNT; i++) {
      paths[`/p${i}`] = {
        get: { operationId: `op${i}`, responses: { "200": { description: "ok" } } },
      };
    }
  } else {
    for (let i = 1; i <= TOOL_COUNT; i++) {
      const name = `catalog_list_${String(i).padStart(3, "0")}`;
      paths[`/catalog/${String(i).padStart(3, "0")}`] = {
        get: {
          operationId: name,
          summary: `List entities from catalog partition ${i}`,
          description:
            `List entities from catalog partition ${i}. Returns a verbose JSON array with nested meta/history. ` +
            `Partition theme: ${["pets", "orders", "users", "tickets", "assets"][i % 5]}.`,
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["available", "sold", "any"], default: "any" },
            },
            {
              name: "includeMeta",
              in: "query",
              schema: { type: "boolean", default: true },
            },
          ],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      };
    }
  }
  return {
    openapi: "3.0.3",
    info: { title: kind === "lean" ? "lean" : "equalArmCatalog", version: "1" },
    servers: [{ url: baseUrl }],
    paths,
  };
}

async function measure(kind) {
  const home = join(tmpdir(), `cat-rss-${kind}-${process.pid}`);
  await mkdir(home, { recursive: true });
  const port = await pickPort();
  const mockPort = await pickPort();
  const mock = createHttpServer((_q, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"items":[]}');
  });
  await new Promise((r) => mock.listen(mockPort, "127.0.0.1", r));
  const spec = buildSpec(kind, `http://127.0.0.1:${mockPort}`);
  const specPath = join(home, "spec.json");
  const specText = JSON.stringify(spec, null, kind === "fat" ? 2 : 0);
  await writeFile(specPath, specText);

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
  };

  const child = spawn(BUN, ["--smol", join(ROOT, "dist/server-http.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  child.stderr?.on("data", (c) => {
    log += c;
  });
  try {
    await waitTcp(port, 60000);
    await new Promise((r) => setTimeout(r, 800));
    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    return {
      kind,
      spec_bytes: specText.length,
      path_count: Object.keys(spec.paths).length,
      proc_rss_mb: rssMb(child.pid),
      smaps: smapsRollup(child.pid),
      bench: hz.bench ?? null,
      log_tail: log.slice(-400),
    };
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
    mock.close();
  }
}

const lean = await measure("lean");
const fat = await measure("fat");
const out = {
  measuredAt: new Date().toISOString(),
  tool_count: TOOL_COUNT,
  lean,
  fat,
  delta_mb: {
    proc_rss: lean.proc_rss_mb != null && fat.proc_rss_mb != null
      ? Number((fat.proc_rss_mb - lean.proc_rss_mb).toFixed(2))
      : null,
    anon:
      lean.smaps?.anonymous_mb != null && fat.smaps?.anonymous_mb != null
        ? Number((fat.smaps.anonymous_mb - lean.smaps.anonymous_mb).toFixed(2))
        : null,
    spec_bytes: fat.spec_bytes - lean.spec_bytes,
  },
  interpretation:
    "If fat−lean ≪ 100 MB, catalog JSON duplication is not the 155→280 gap. " +
    "If fat−lean is large, inventory openapi vs operations vs validators next.",
};
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
