#!/usr/bin/env node
/**
 * Single-client profile for Executor MCP path (harness suspicion check).
 * Does not publish numbers — writes JSON under /opt/cursor/artifacts/.
 */
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ensureExecutorOpenapiApp } from "./lib/ensure-executor-openapi-app.mjs";
import { executorV2ToolScripts } from "./code-mode/published-scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK_JS = join(HERE, "mock/cloudflare-replay-mock.mjs");
const FIXTURE = join(HERE, "fixtures/recording.synthetic.json");
const CURATED = join(HERE, "fixtures/curated-openapi.json");
const key = readFileSync("/tmp/executor-v2-data/api_key.txt", "utf8").trim();
const mcpUrl = process.env.EXECUTOR_V2_URL?.trim() || "http://127.0.0.1:4312/mcp";

function treeSnap() {
  const out = execSync("ps -eo pid,rss,cmd", { encoding: "utf8" });
  const rows = [];
  let rssKb = 0;
  let motelKb = 0;
  for (const line of out.split("\n")) {
    if (!/executor|workerd/i.test(line) || /profile-executor|rg /.test(line)) continue;
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const rss = Number(m[2]);
    const cmd = m[3];
    const kind = /motel/.test(cmd)
      ? "motel"
      : /workerd/.test(cmd)
        ? "workerd"
        : /executor/.test(cmd)
          ? "serve"
          : "other";
    rssKb += rss;
    if (kind === "motel") motelKb += rss;
    rows.push({ pid: Number(m[1]), rss_mb: +(rss / 1024).toFixed(1), kind, cmd: cmd.slice(0, 140) });
  }
  return {
    total_rss_mb: +(rssKb / 1024).toFixed(1),
    excl_motel_rss_mb: +((rssKb - motelKb) / 1024).toFixed(1),
    rows,
  };
}

async function startMock() {
  const child = spawn(process.execPath, [MOCK_JS], {
    env: { ...process.env, FIXTURE, MT_UPSTREAM_LATENCY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  const base = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`mock timeout: ${buf.slice(0, 300)}`)), 30000);
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (c) => reject(new Error(`mock exit ${c}: ${buf.slice(0, 300)}`)));
  });
  return {
    base,
    close: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  };
}

async function oneCall(label, code) {
  const memBefore = treeSnap();
  const tConnect = performance.now();
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  const client = new Client({ name: "profile", version: "0" });
  await client.connect(transport);
  const connectMs = performance.now() - tConnect;
  const tList = performance.now();
  const listed = await client.listTools();
  const listMs = performance.now() - tList;
  const names = listed.tools.map((t) => t.name);
  const tCall = performance.now();
  const res = await client.callTool({ name: "execute", arguments: { code } });
  const callMs = performance.now() - tCall;
  const memAfter = treeSnap();
  const content = res?.content;
  let preview = "";
  try {
    preview = JSON.stringify(content ?? res).slice(0, 240);
  } catch {
    preview = String(res).slice(0, 240);
  }
  await client.close();
  return {
    label,
    url: mcpUrl,
    connectMs: +connectMs.toFixed(1),
    listToolsMs: +listMs.toFixed(1),
    executeMs: +callMs.toFixed(1),
    toolNames: names,
    hasExecute: names.includes("execute"),
    isError: Boolean(res?.isError),
    resultPrefix: preview,
    memBefore_excl_motel_rss_mb: memBefore.excl_motel_rss_mb,
    memAfter_excl_motel_rss_mb: memAfter.excl_motel_rss_mb,
    deltaRssMb: +(memAfter.excl_motel_rss_mb - memBefore.excl_motel_rss_mb).toFixed(1),
  };
}

const mock = await startMock();
try {
  const idle = treeSnap();
  const t0 = performance.now();
  const meta = ensureExecutorOpenapiApp({
    mockBase: mock.base,
    openapiDoc: JSON.parse(readFileSync(CURATED, "utf8")),
  });
  const ensureMs = performance.now() - t0;
  const afterEnsure = treeSnap();
  const scripts = executorV2ToolScripts({ appSlug: meta.slug });
  const code = scripts[4];
  const cold = await oneCall("cold", code);
  const warm1 = await oneCall("warm1", code);
  const warm2 = await oneCall("warm2", code);
  const out = {
    executorVersion: "2.0.0-beta.37",
    channelNote:
      "npm dist-tag latest=1.6.11; beta=2.0.0-beta.37. No non-prerelease GitHub 2.0.0 release. npm package version 2.0.0 exists but is an old RhysSullivan/executor tarball (not UsefulSoftwareCo stable on latest).",
    mcpUrl,
    idle,
    ensureApp: {
      ensureMs: +ensureMs.toFixed(1),
      slug: meta.slug,
      deploymentId: meta.deploymentId,
      origin: meta.origin,
      rss_before: idle.excl_motel_rss_mb,
      rss_after: afterEnsure.excl_motel_rss_mb,
    },
    calls: { cold, warm1, warm2 },
    harnessSuspicion: {
      idleExclMotelGbClass: idle.excl_motel_rss_mb >= 1024,
      workerdAlwaysResident: idle.rows.some((r) => r.kind === "workerd"),
      motelSeparate: idle.rows.some((r) => r.kind === "motel"),
      endpointIsMcpNotDashboard: mcpUrl.endsWith("/mcp"),
      executePresent: cold.hasExecute,
    },
  };
  writeFileSync("/opt/cursor/artifacts/executor-β37-single-client-profile.json", JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
} finally {
  mock.close();
}
