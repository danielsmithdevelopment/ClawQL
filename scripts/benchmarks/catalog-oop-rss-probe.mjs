#!/usr/bin/env node
/**
 * Ready RSS: in-process persist vs out-of-process catalog build (default).
 *
 *   node scripts/benchmarks/catalog-oop-rss-probe.mjs
 *   SPEC=/workspace/providers/cloudflare/openapi.yaml node scripts/benchmarks/catalog-oop-rss-probe.mjs
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { mkdirSync, writeFileSync, existsSync, readFileSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

const ROOT = "/workspace";
const OUT =
  process.env.OUT ||
  `/opt/cursor/artifacts/catalog-oop-rss-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
let SPEC = process.env.SPEC || "";
const READY_MS = Number(process.env.READY_MS || 600_000);

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

async function waitTcp(port, ms) {
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
  };
}

async function boot({ label, buildMode, loadDb = false, prebuiltDb = null }) {
  const home = join(tmpdir(), `cat-oop-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  if (prebuiltDb) {
    writeFileSync(join(home, "catalog.sqlite"), readFileSync(prebuiltDb));
  }
  const port = await pickPort();
  const env = clawqlEqualArmEnv({
    home,
    specPath: SPEC,
    apiBase: "http://127.0.0.1:9",
  });
  Object.assign(env, {
    PORT: String(port),
    MCP_HOST: "127.0.0.1",
    CLAWQL_CATALOG_SQLITE: "1",
    CLAWQL_CATALOG_SQLITE_BUILD: buildMode,
    ...(loadDb ? { CLAWQL_CATALOG_SQLITE_LOAD: "db" } : {}),
    // Keep listen lean for catalog RSS — match underload benches.
    CLAWQL_HTTP_SKIP_PAYMENTS: "1",
    CLAWQL_HTTP_SKIP_GRAPHQL: "1",
  });
  const logPath = join(home, "clawql.log");
  const logFd = openSync(logPath, "w");
  const child = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
    env,
    stdio: ["ignore", logFd, logFd],
  });
  const deadline = Date.now() + READY_MS;
  let ready = false;
  while (Date.now() < deadline) {
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf8");
      if (log.includes("listening on") || log.includes("Streamable HTTP MCP")) {
        ready = true;
        break;
      }
      if (log.includes("Fatal startup error") || log.includes("oop-build failed")) {
        // keep waiting — oop failure falls back; fatal stops
        if (log.includes("Fatal startup error")) {
          child.kill("SIGTERM");
          throw new Error(`${label} fatal:\n${log.slice(-2500)}`);
        }
      }
    }
    try {
      process.kill(child.pid, 0);
    } catch {
      throw new Error(`${label} died:\n${readFileSync(logPath, "utf8").slice(-2500)}`);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  if (!ready) {
    child.kill("SIGTERM");
    throw new Error(`${label} ready timeout:\n${readFileSync(logPath, "utf8").slice(-2500)}`);
  }
  await waitTcp(port, 10000);
  await new Promise((r) => setTimeout(r, 400));
  const log = readFileSync(logPath, "utf8");
  const smaps = smapsRollup(child.pid);
  const catalogPath = join(home, "catalog.sqlite");
  const result = {
    label,
    buildMode,
    loadDb,
    pid: child.pid,
    home,
    smaps,
    catalog_sqlite_bytes: existsSync(catalogPath)
      ? readFileSync(catalogPath).byteLength
      : null,
    banners: {
      oop_build: /\[catalog-sqlite\] oop-build starting/.test(log),
      oop_wrote: /\[catalog-sqlite\] oop-wrote/.test(log),
      wrote_inprocess: /\[catalog-sqlite\] wrote /.test(log) && !/oop-wrote/.test(log),
      load_db: /\[catalog-sqlite\] loaded .+ \(LOAD=db/.test(log),
      loaded_ops: (log.match(/Loaded (\d+) operations/) ||
        log.match(/loaded (\d+) operations from/))?.[1] || null,
    },
    log_tail: log.trim().split("\n").slice(-16),
  };
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 300));
  try {
    child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  return result;
}

async function main() {
  if (!SPEC || !existsSync(SPEC)) {
    // synthesize a small fat-ish spec if fixture missing
    const home = join(tmpdir(), `cat-oop-spec-${process.pid}`);
    mkdirSync(home, { recursive: true });
    const paths = {};
    for (let i = 1; i <= 80; i++) {
      paths[`/p${i}`] = {
        get: {
          operationId: `op${i}`,
          summary: `Op ${i} `.repeat(20),
          description: `Description for operation ${i}. `.repeat(40),
          responses: { "200": { description: "ok" } },
        },
      };
    }
    SPEC = join(home, "spec.json");
    writeFileSync(
      SPEC,
      JSON.stringify({
        openapi: "3.0.0",
        info: { title: "oopProbe", version: "1" },
        paths,
      })
    );
    console.error(`[probe] using synthetic spec ${SPEC}`);
  }
  const report = {
    measuredAt: new Date().toISOString(),
    spec: SPEC,
    spec_bytes: readFileSync(SPEC).byteLength,
    arms: {},
  };

  // 1) in-process persist (old path)
  report.arms.inprocess = await boot({
    label: "inprocess",
    buildMode: "inprocess",
  });

  // 2) OOP build on empty home (default product path)
  report.arms.oop_first_boot = await boot({
    label: "oop-first",
    buildMode: "oop",
  });

  // 3) LOAD=db only — prebuild via compile script if present, else reuse oop DB
  const prebuiltHome = report.arms.oop_first_boot.home;
  const prebuilt = join(prebuiltHome, "catalog.sqlite");
  report.arms.loaddb_only = await boot({
    label: "loaddb",
    buildMode: "oop",
    loadDb: true,
    prebuiltDb: existsSync(prebuilt) ? prebuilt : null,
  });

  report.delta_mb = {
    oop_vs_inprocess_anon:
      report.arms.oop_first_boot.smaps && report.arms.inprocess.smaps
        ? Number(
            (
              report.arms.oop_first_boot.smaps.anonymous_mb -
              report.arms.inprocess.smaps.anonymous_mb
            ).toFixed(2)
          )
        : null,
    loaddb_vs_inprocess_anon:
      report.arms.loaddb_only.smaps && report.arms.inprocess.smaps
        ? Number(
            (
              report.arms.loaddb_only.smaps.anonymous_mb -
              report.arms.inprocess.smaps.anonymous_mb
            ).toFixed(2)
          )
        : null,
  };
  report.interpretation =
    "oop_first_boot should show oop_build+load_db banners and anon near loaddb_only. " +
    "inprocess may keep higher anon after parse even with persist-then-slim (JS rarely returns RSS).";

  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  // Leave homes for inspection unless CLEAN_HOMES=1
  if (process.env.CLEAN_HOMES === "1") {
    for (const arm of Object.values(report.arms)) {
      try {
        rmSync(arm.home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
