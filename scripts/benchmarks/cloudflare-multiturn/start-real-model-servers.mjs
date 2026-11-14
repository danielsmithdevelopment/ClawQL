#!/usr/bin/env node
/** Start mock + ClawQL for Cursor-subagent real-model sessions. Writes URLs to /tmp/cf-mt-real/ */
import { spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer, createConnection } from "node:net";
import { clawqlEqualArmEnv } from "../lib/clawql-bench-env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");
const FIXTURE = join(HERE, "fixtures/recording.synthetic.json");
const CURATED_OAS = join(HERE, "fixtures/curated-openapi.json");
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const STATE = process.env.CF_MT_REAL_STATE || "/tmp/cf-mt-real";
const ENABLE_PROGRAMS = process.env.CLAWQL_ENABLE_PROGRAMS === "1";

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
async function waitTcp(port, ms = 60000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise((r) => {
      const c = createConnection({ host: "127.0.0.1", port }, () => {
        c.end();
        r(true);
      });
      c.on("error", () => r(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`tcp timeout :${port}`);
}

mkdirSync(STATE, { recursive: true });

const mock = spawn(process.execPath, [MOCK_JS], {
  env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let mockReady = null;
let buf = "";
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("mock timeout")), 20000);
  mock.stdout.on("data", (d) => {
    buf += d.toString();
    const line = buf.split("\n").find((l) => l.includes('"ready"'));
    if (line) {
      mockReady = JSON.parse(line);
      clearTimeout(t);
      resolve();
    }
  });
  mock.stderr.on("data", (d) => process.stderr.write(d));
  mock.on("exit", (c) => reject(new Error(`mock exited ${c}`)));
});
await waitTcp(Number(new URL(mockReady.baseUrl).port));

const home = join(STATE, "clawql-home");
mkdirSync(home, { recursive: true });
const port = await pickPort();
const env = clawqlEqualArmEnv({
  home,
  specPath: CURATED_OAS,
  apiBase: mockReady.baseUrl,
});
Object.assign(env, {
  PORT: String(port),
  MCP_HOST: "127.0.0.1",
  CLOUDFLARE_API_TOKEN: "bench-fake-token",
  CLAWQL_CATALOG_SQLITE: "1",
  CLAWQL_SEARCH_COMPACT: "0",
  CLAWQL_ENABLE_PROGRAMS: ENABLE_PROGRAMS ? "1" : "0",
  CLAWQL_EXECUTE_RESULT_MAX_CHARS: "2000000",
});
const logPath = join(STATE, "clawql.log");
const logFd = openSync(logPath, "w");
const clawql = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
  env,
  stdio: ["ignore", logFd, logFd],
  detached: true,
});
clawql.unref();
mock.unref();

const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  if (existsSync(logPath)) {
    const log = readFileSync(logPath, "utf8");
    if (log.includes("listening on") || log.includes("Streamable HTTP MCP")) break;
    if (log.includes("Fatal startup error")) throw new Error(log.slice(-1500));
  }
  await new Promise((r) => setTimeout(r, 80));
}
await waitTcp(port, 10000);

const mcpUrl = `http://127.0.0.1:${port}/mcp`;
const meta = {
  mockBase: mockReady.baseUrl,
  mcpUrl,
  mockPid: mock.pid,
  clawqlPid: clawql.pid,
  enablePrograms: ENABLE_PROGRAMS,
  logPath,
};
writeFileSync(join(STATE, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
writeFileSync(join(STATE, "mcp-url"), mcpUrl + "\n");
writeFileSync(join(STATE, "pids"), `${mock.pid}\n${clawql.pid}\n`);
closeSync(logFd);
console.log(JSON.stringify(meta, null, 2));
