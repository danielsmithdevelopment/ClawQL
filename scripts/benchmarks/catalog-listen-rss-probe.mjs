/**
 * Same Bun HTTP Ready path — lean vs fat OpenAPI catalog, optional SQLite slim/LOAD=db.
 *
 *   node scripts/benchmarks/catalog-listen-rss-probe.mjs
 *   COMPARE_SQLITE=1 node scripts/benchmarks/catalog-listen-rss-probe.mjs
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
const COMPARE_SQLITE =
  process.env.COMPARE_SQLITE === "1" ||
  process.env.COMPARE_SQLITE === "true" ||
  process.env.COMPARE_SQLITE === "yes";

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
  const pss = get("Pss");
  return {
    rss_mb: rss != null ? Number((rss / 1024).toFixed(2)) : null,
    anonymous_mb: anon != null ? Number((anon / 1024).toFixed(2)) : null,
    pss_mb: pss != null ? Number((pss / 1024).toFixed(2)) : null,
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

/**
 * @param {"lean"|"fat"} kind
 * @param {{ sqlite?: "off"|"persist"|"loaddb" }} opts
 */
async function measure(kind, opts = {}) {
  const sqliteMode = opts.sqlite ?? "off";
  const home = join(tmpdir(), `cat-rss-${kind}-${sqliteMode}-${process.pid}-${Date.now()}`);
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

  const catalogPath = join(home, "catalog.sqlite");
  if (sqliteMode === "loaddb") {
    const compile = spawn(
      process.execPath,
      [
        join(ROOT, "scripts/benchmarks/compile-catalog-sqlite.mjs"),
        "--spec",
        specPath,
        "--out",
        catalogPath,
      ],
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env }
    );
    let cErr = "";
    compile.stderr?.on("data", (c) => {
      cErr += c;
    });
    const code = await new Promise((resolve) => compile.on("close", resolve));
    if (code !== 0) {
      mock.close();
      throw new Error(`compile-catalog-sqlite failed: ${cErr.slice(-800)}`);
    }
  }

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

  if (sqliteMode === "persist") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
  } else if (sqliteMode === "loaddb") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
    env.CLAWQL_CATALOG_SQLITE_LOAD = "db";
    // Prefer DB; keep SPEC unset so tryLoadCatalogSqliteOnly does not need LOAD=db only —
    // LOAD=db is set anyway so SPEC could remain, but clear for a clean "ops-only" listen.
    delete env.CLAWQL_SPEC_PATH;
    delete env.OPENAPI_SPEC_PATH;
    delete env.OPENAPI_FILE;
  }

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
      sqlite: sqliteMode,
      spec_bytes: specText.length,
      path_count: Object.keys(spec.paths).length,
      catalog_sqlite_bytes: existsSync(catalogPath)
        ? readFileSync(catalogPath).byteLength
        : null,
      proc_rss_mb: rssMb(child.pid),
      smaps: smapsRollup(child.pid),
      bench: hz.bench ?? null,
      log_tail: log.slice(-600),
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

function delta(a, b, key) {
  const av = a?.[key];
  const bv = b?.[key];
  if (av == null || bv == null) return null;
  return Number((bv - av).toFixed(2));
}

function smapDelta(a, b, key) {
  const av = a?.smaps?.[key];
  const bv = b?.smaps?.[key];
  if (av == null || bv == null) return null;
  return Number((bv - av).toFixed(2));
}

const lean = await measure("lean");
const fat = await measure("fat");
const out = {
  measuredAt: new Date().toISOString(),
  tool_count: TOOL_COUNT,
  compare_sqlite: COMPARE_SQLITE,
  lean,
  fat,
  delta_mb: {
    proc_rss: delta(lean, fat, "proc_rss_mb"),
    anon: smapDelta(lean, fat, "anonymous_mb"),
    pss: smapDelta(lean, fat, "pss_mb"),
    spec_bytes: fat.spec_bytes - lean.spec_bytes,
  },
  interpretation:
    "If fat−lean ≪ 100 MB, catalog JSON duplication is not the 155→280 gap. " +
    "If fat−lean is large, inventory openapi vs operations vs validators next. " +
    "With COMPARE_SQLITE=1, fat_sqlite_* vs fat shows whether slim/LOAD=db cuts anon/PSS.",
};

if (COMPARE_SQLITE) {
  const fatPersist = await measure("fat", { sqlite: "persist" });
  const fatLoadDb = await measure("fat", { sqlite: "loaddb" });
  out.fat_sqlite_persist = fatPersist;
  out.fat_sqlite_loaddb = fatLoadDb;
  out.sqlite_delta_vs_fat_mb = {
    persist: {
      proc_rss: delta(fat, fatPersist, "proc_rss_mb"),
      anon: smapDelta(fat, fatPersist, "anonymous_mb"),
      pss: smapDelta(fat, fatPersist, "pss_mb"),
    },
    loaddb: {
      proc_rss: delta(fat, fatLoadDb, "proc_rss_mb"),
      anon: smapDelta(fat, fatLoadDb, "anonymous_mb"),
      pss: smapDelta(fat, fatLoadDb, "pss_mb"),
    },
  };
}

await mkdir(dirnameSafe(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

function dirnameSafe(p) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}
