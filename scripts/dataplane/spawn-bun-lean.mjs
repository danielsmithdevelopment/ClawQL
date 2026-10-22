#!/usr/bin/env node
/**
 * Spawn Bun --smol host with the same equal-arm env as heap-vs-anon-plateau
 * (published ~130 MB anon cite). Writes pid/url JSON to --out-meta.
 *
 *   node scripts/dataplane/spawn-bun-lean.mjs \
 *     --port 12345 --home /tmp/h --catalog /path/c.sqlite \
 *     --spec /path/curated.json --api-base http://127.0.0.1:9 \
 *     --server dist/server-http.js --log /tmp/bun.log --out-meta /tmp/meta.json
 */
import { spawn } from "node:child_process";
import { openSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clawqlEqualArmEnv } from "./lib/clawql-bench-env.mjs";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(arg("--port"));
const home = resolve(arg("--home"));
const catalog = resolve(arg("--catalog"));
const spec = resolve(arg("--spec"));
const apiBase = arg("--api-base");
const server = resolve(arg("--server", resolve(ROOT, "dist/server-http.js")));
const logPath = resolve(arg("--log", resolve(home, "bun.log")));
const outMeta = resolve(arg("--out-meta", resolve(home, "bun-meta.json")));
const bunBin = arg("--bun", process.env.BUN_BIN || "bun");

if (!port || !home || !catalog || !spec || !apiBase) {
  console.error(
    "usage: spawn-bun-lean.mjs --port N --home DIR --catalog FILE --spec FILE --api-base URL [--server PATH] [--log PATH] [--out-meta PATH]"
  );
  process.exit(2);
}
if (!existsSync(server)) {
  console.error(`missing server: ${server}`);
  process.exit(1);
}
mkdirSync(home, { recursive: true });
mkdirSync(dirname(logPath), { recursive: true });

// Minimal base env — do NOT inherit agent vault / fat CLAWQL_* from the cloud shell.
const minimalBase = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  USER: process.env.USER,
  LANG: process.env.LANG,
  NODE_ENV: process.env.NODE_ENV || "production",
  TMPDIR: process.env.TMPDIR,
};

const env = clawqlEqualArmEnv({
  home,
  specPath: spec,
  apiBase,
  baseEnv: minimalBase,
});
Object.assign(env, {
  PORT: String(port),
  MCP_PORT: String(port),
  MCP_HOST: "127.0.0.1",
  CLOUDFLARE_API_TOKEN: "bench-fake-token",
  CLAWQL_CATALOG_SQLITE: "1",
  CLAWQL_CATALOG_SQLITE_PATH: catalog,
  CLAWQL_CATALOG_SQLITE_LOAD: "db",
  CLAWQL_CATALOG_SQLITE_BUILD: "oop",
  CLAWQL_BENCH_STATS: "1",
  CLAWQL_SEARCH_COMPACT: "0", // same as heap-vs-anon RSS probe
  CLAWQL_HTTP_SKIP_PAYMENTS: "1",
  CLAWQL_HTTP_SKIP_GRAPHQL: "1",
  CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE: "1",
  CLAWQL_ENABLE_PROGRAMS: "0",
});

const fd = openSync(logPath, "w");
const child = spawn(bunBin, ["--smol", server], {
  env,
  cwd: ROOT,
  stdio: ["ignore", fd, fd],
  detached: true,
});
child.unref();

const meta = {
  pid: child.pid,
  port,
  url: `http://127.0.0.1:${port}/mcp`,
  log: logPath,
  home,
  catalog,
  argv: [bunBin, "--smol", server],
  profile: "heap-vs-anon-equal-arm-lean",
};
writeFileSync(outMeta, JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta));
