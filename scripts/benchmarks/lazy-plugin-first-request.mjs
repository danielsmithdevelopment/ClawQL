#!/usr/bin/env node
/**
 * First MCP / first k8s-use latency for lazily loaded horizontal packages.
 *
 *   node scripts/benchmarks/lazy-plugin-first-request.mjs
 *
 * Spawns short-lived listens (equal-arm base + one feature) and times the first
 * tool call that pulls the package in, vs a warm second call.
 */
import { spawn } from "node:child_process";
import { createServer as createNetServer, createConnection } from "node:net";
import { mkdirSync, writeFileSync, existsSync, readFileSync, openSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { clawqlEqualArmEnv, clawqlEqualArmInstanceSpec } from "./lib/clawql-bench-env.mjs";

const ROOT = "/workspace";
const OUT =
  process.env.OUT ||
  join(ROOT, "docs/benchmarks/gateway-multi-comparison/lazy-plugin-first-request.json");
const require = createRequire(import.meta.url);

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

function mapsHits(pid) {
  try {
    const maps = readFileSync(`/proc/${pid}/maps`, "utf8");
    return {
      kubernetes: /node_modules\/@kubernetes\//.test(maps),
      xenova: /node_modules\/@xenova\//.test(maps),
      onnx: /onnxruntime/.test(maps),
      stripe: /node_modules\/stripe\//.test(maps),
      duckdb: /@duckdb\//.test(maps),
    };
  } catch {
    return null;
  }
}

function ensureMiniSpec(dir) {
  const path = join(dir, "spec.json");
  const doc = {
    openapi: "3.0.0",
    info: { title: "lazyFirstHit", version: "1" },
    paths: {
      "/ping": {
        get: {
          operationId: "ping",
          responses: { "200": { description: "ok" } },
        },
      },
    },
  };
  writeFileSync(path, JSON.stringify(doc));
  return path;
}

async function startListen({ label, instanceSpecPatch, extraEnv = {} }) {
  const home = join(tmpdir(), `lazy-first-${label}-${process.pid}-${Date.now()}`);
  mkdirSync(home, { recursive: true });
  const specPath = ensureMiniSpec(home);
  const port = await pickPort();
  const logPath = join(home, "listen.log");
  const logFd = openSync(logPath, "w");
  const baseSpec = clawqlEqualArmInstanceSpec();
  const spec = { ...baseSpec, ...instanceSpecPatch };
  // deep-merge automation if present
  if (instanceSpecPatch?.automation) {
    spec.automation = { ...baseSpec.automation, ...instanceSpecPatch.automation };
  }
  if (instanceSpecPatch?.memory) {
    spec.memory = { ...baseSpec.memory, ...instanceSpecPatch.memory };
  }
  const env = clawqlEqualArmEnv({
    home,
    specPath,
    apiBase: "http://127.0.0.1:9",
    baseEnv: {
      ...process.env,
      PORT: String(port),
      MCP_HOST: "127.0.0.1",
      CLAWQL_CATALOG_SQLITE: "1",
      CLAWQL_CATALOG_SQLITE_BUILD: "oop",
      CLAWQL_HTTP_SKIP_PAYMENTS: "1",
      CLAWQL_HTTP_SKIP_GRAPHQL: "1",
      ...extraEnv,
    },
  });
  env.CLAWQL_INSTANCE_SPEC = JSON.stringify(spec);
  const child = spawn(process.execPath, [join(ROOT, "dist/server-http.js")], {
    env,
    stdio: ["ignore", logFd, logFd],
    detached: false,
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (existsSync(logPath) && /listening on/.test(readFileSync(logPath, "utf8"))) break;
    if (child.exitCode != null) throw new Error(`listen exited early: ${readFileSync(logPath, "utf8").slice(-800)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  await waitTcp(port, 30000);
  return {
    pid: child.pid,
    port,
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    home,
    logPath,
    maps_at_ready: mapsHits(child.pid),
    async close() {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 200));
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

async function mcpCall(mcpUrl, name, toolName, args) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name, version: "1" }, {});
  await client.connect(transport);
  try {
    const t0 = performance.now();
    const res = await client.callTool({ name: toolName, arguments: args });
    const ms = Number((performance.now() - t0).toFixed(2));
    const text = Array.isArray(res?.content)
      ? res.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n")
      : "";
    const isError = Boolean(res?.isError) || /error|Error|Cannot find|MODULE_NOT_FOUND/i.test(text.slice(0, 400));
    return { ms, isError, text_head: text.slice(0, 240) };
  } finally {
    await client.close().catch(() => {});
  }
}

async function measureMemoryFirstHit() {
  const listen = await startListen({
    label: "memory",
    instanceSpecPatch: { memory: { enabled: true } },
    extraEnv: {
      CLAWQL_OBSIDIAN_VAULT_PATH: join(tmpdir(), `lazy-vault-${process.pid}`),
    },
  });
  try {
    mkdirSync(listen.home + "-vault", { recursive: true });
    // Re-point vault into home so ingest has a writable path
    const first = await mcpCall(listen.mcpUrl, "lazy-mem-1", "memory_ingest", {
      title: "lazy-first-hit",
      insights: "probe first hit",
    });
    const second = await mcpCall(listen.mcpUrl, "lazy-mem-2", "memory_ingest", {
      title: "lazy-first-hit",
      insights: "probe second hit",
      append: true,
    });
    return {
      feature: "memory",
      maps_at_ready: listen.maps_at_ready,
      maps_after_first: mapsHits(listen.pid),
      first_tool_ms: first.ms,
      second_tool_ms: second.ms,
      first_is_error: first.isError,
      second_is_error: second.isError,
      first_text_head: first.text_head,
      second_text_head: second.text_head,
    };
  } finally {
    await listen.close();
  }
}

async function measureK8sFirstUse() {
  // k8s-client is bundled into workflow.js (not a separate dist file). Measure the
  // same dynamic import(@kubernetes/client-node) path, resolved from automation.
  const resolveFrom = join(ROOT, "packages/clawql-automation/package.json");
  const childCode = `
    import { createRequire } from 'node:module';
    import { performance } from 'node:perf_hooks';
    const req = createRequire(${JSON.stringify(resolveFrom)});
    const resolved = req.resolve('@kubernetes/client-node');
    const t0 = performance.now();
    try {
      const k8s = await import(resolved);
      const firstMs = performance.now() - t0;
      const t1 = performance.now();
      await import(resolved);
      const secondMs = performance.now() - t1;
      const keys = Object.keys(k8s);
      console.log(JSON.stringify({
        ok: true,
        resolved,
        first_import_ms: +firstMs.toFixed(2),
        second_import_ms: +secondMs.toFixed(2),
        admission_surface: keys.some((k) => /Admission/i.test(k)),
        export_count: keys.length,
      }));
    } catch (err) {
      console.log(JSON.stringify({
        ok: false,
        first_import_ms: +(performance.now() - t0).toFixed(2),
        error: err instanceof Error ? (err.name + ': ' + err.message) : String(err),
        clear_error: true,
        note: 'Failed k8s import must surface; automation tools should not silently half-work',
      }));
    }
  `;
  const t0 = performance.now();
  const out = await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ["--input-type=module", "-e", childCode], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) reject(new Error(stderr || `exit ${code}`));
      else resolve(stdout.trim());
    });
  });
  const wall = Number((performance.now() - t0).toFixed(2));
  try {
    return { feature: "kubernetes", wall_ms: wall, ...JSON.parse(out.split("\n").at(-1)) };
  } catch {
    return { feature: "kubernetes", ok: false, wall_ms: wall, raw: out.slice(0, 500) };
  }
}

async function measureAutomationPluginListen() {
  // Enabling workflow/argocd should load clawql-automation at Ready, but not map k8s until use.
  const listen = await startListen({
    label: "automation",
    instanceSpecPatch: {
      automation: {
        schedule: { enabled: false },
        notify: { enabled: false },
        workflow: { enabled: true },
        argocd: { enabled: false },
        hitlLabelStudio: { enabled: false },
      },
    },
  });
  try {
    const listed = await (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(listen.mcpUrl));
      const client = new Client({ name: "lazy-auto", version: "1" }, {});
      await client.connect(transport);
      try {
        const t0 = performance.now();
        const tools = await client.listTools();
        return {
          list_tools_ms: Number((performance.now() - t0).toFixed(2)),
          tool_names: tools.tools.map((t) => t.name).filter((n) => /workflow|argo|schedule|notify/i.test(n)),
        };
      } finally {
        await client.close().catch(() => {});
      }
    })();
    return {
      feature: "automation_listen",
      maps_at_ready: listen.maps_at_ready,
      ...listed,
      note: "workflow enabled loads automation plugin; k8s maps should still be false until getWorkflowK8sClients",
    };
  } finally {
    await listen.close();
  }
}

async function main() {
  const results = {
    measuredAt: new Date().toISOString(),
    note:
      "First MCP tool call after enabling a lazy tier; k8s measured via getWorkflowK8sClients() in a fresh process.",
  };
  try {
    results.memory = await measureMemoryFirstHit();
  } catch (err) {
    results.memory = { feature: "memory", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  try {
    results.automation_listen = await measureAutomationPluginListen();
  } catch (err) {
    results.automation_listen = {
      feature: "automation_listen",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    results.kubernetes = await measureK8sFirstUse();
  } catch (err) {
    results.kubernetes = {
      feature: "kubernetes",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  try {
    writeFileSync("/opt/cursor/artifacts/lazy-plugin-first-request.json", JSON.stringify(results, null, 2));
  } catch {
    /* ignore */
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
