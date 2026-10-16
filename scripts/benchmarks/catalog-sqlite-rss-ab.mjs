/**
 * Ready RSS / anon / PSS A/B: in-memory OpenAPI vs CLAWQL_CATALOG_SQLITE LOAD=db.
 *
 *   node scripts/benchmarks/catalog-sqlite-rss-ab.mjs
 *   SPEC=providers/sentry/openapi.json node scripts/benchmarks/catalog-sqlite-rss-ab.mjs
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = "/workspace";
const BUN = process.env.BUN_BIN || `${process.env.HOME}/.bun/bin/bun`;
const OUT = process.env.OUT || "/opt/cursor/artifacts/catalog-sqlite-rss-ab.json";
const SPEC = resolve(ROOT, process.env.SPEC || "providers/sentry/openapi.json");

const { clawqlEqualArmEnv } = await import(
  join(ROOT, "scripts/benchmarks/lib/clawql-bench-env.mjs")
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

async function waitTcp(port, ms = 120000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolveP) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        resolveP(true);
      });
      c.on("error", () => resolveP(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 80));
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

async function runCompile(specPath, outPath) {
  const child = spawn(
    process.execPath,
    [
      join(ROOT, "scripts/benchmarks/compile-catalog-sqlite.mjs"),
      "--spec",
      specPath,
      "--out",
      outPath,
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );
  let out = "";
  let err = "";
  child.stdout?.on("data", (c) => {
    out += c;
  });
  child.stderr?.on("data", (c) => {
    err += c;
  });
  const code = await new Promise((r) => child.on("close", r));
  if (code !== 0) throw new Error(`compile failed: ${err.slice(-1200)}`);
  return out ? JSON.parse(out) : null;
}

async function measure(mode, { home, specPath, catalogPath }) {
  const port = await pickPort();
  const env = {
    ...clawqlEqualArmEnv({
      home,
      specPath,
      apiBase: "https://example.invalid",
    }),
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

  if (mode === "memory") {
    // baseline: parse OpenAPI into heap (explicit opt-out — product default is on)
    env.CLAWQL_CATALOG_SQLITE = "0";
  } else if (mode === "sqlite_persist") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
  } else if (mode === "sqlite_loaddb") {
    env.CLAWQL_CATALOG_SQLITE = "1";
    env.CLAWQL_CATALOG_SQLITE_PATH = catalogPath;
    env.CLAWQL_CATALOG_SQLITE_LOAD = "db";
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
    await waitTcp(port, 180000);
    await new Promise((r) => setTimeout(r, 1200));
    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    return {
      mode,
      proc_rss_mb: rssMb(child.pid),
      smaps: smapsRollup(child.pid),
      bench: hz.bench ?? null,
      catalog_sqlite_bytes: existsSync(catalogPath)
        ? statSync(catalogPath).size
        : null,
      log_tail: log.slice(-800),
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
  }
}

if (!existsSync(SPEC)) {
  console.error(`spec not found: ${SPEC}`);
  process.exit(2);
}

const home = join(tmpdir(), `cat-sqlite-ab-${process.pid}`);
await mkdir(home, { recursive: true });
const specPath = join(home, "spec.json");
await copyFile(SPEC, specPath);
const catalogPath = join(home, "catalog.sqlite");

const compileMeta = await runCompile(specPath, catalogPath);
const memory = await measure("memory", { home, specPath, catalogPath: join(home, "unused.sqlite") });
const persist = await measure("sqlite_persist", { home, specPath, catalogPath: join(home, "persist.sqlite") });
const loaddb = await measure("sqlite_loaddb", { home, specPath, catalogPath });

const d = (a, b, k) =>
  a?.[k] != null && b?.[k] != null ? Number((b[k] - a[k]).toFixed(2)) : null;
const sd = (a, b, k) =>
  a?.smaps?.[k] != null && b?.smaps?.[k] != null
    ? Number((b.smaps[k] - a.smaps[k]).toFixed(2))
    : null;

const out = {
  measuredAt: new Date().toISOString(),
  spec: SPEC,
  spec_bytes: statSync(SPEC).size,
  compile: compileMeta,
  memory,
  sqlite_persist: persist,
  sqlite_loaddb: loaddb,
  delta_vs_memory_mb: {
    persist: {
      proc_rss: d(memory, persist, "proc_rss_mb"),
      anon: sd(memory, persist, "anonymous_mb"),
      pss: sd(memory, persist, "pss_mb"),
    },
    loaddb: {
      proc_rss: d(memory, loaddb, "proc_rss_mb"),
      anon: sd(memory, loaddb, "anonymous_mb"),
      pss: sd(memory, loaddb, "pss_mb"),
    },
  },
  interpretation:
    "Negative loaddb deltas mean SQLite LOAD=db cut Ready memory vs parsing the OAS graph. " +
    "Report anon/PSS alongside RSS (file pages still count in RSS).",
};

await mkdir(join("/opt/cursor/artifacts"), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
