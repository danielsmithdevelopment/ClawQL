#!/usr/bin/env node
/**
 * Protocol Fabric demo: wrap a third-party page's WebMCP → /mcp-ui click-to-claim.
 *
 * Architecture (no Node-side coupon logic):
 *
 *   site.html registers tools on document.modelContext
 *        ↑
 *   Chrome CDP (Runtime.evaluate → getTools / executeTool)
 *        ↑
 *   thin MCP proxy (this process) — tools/* only forward to the page
 *        ↑
 *   mcp-api-adapter /mcp-ui presets/cloudflare-claim → Click to claim
 *
 *   npm run build -w mcp-grpc-transport -w mcp-api-adapter
 *   node examples/mcp-api-adapter/cloudflare-claim-server.mjs
 *   open http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim
 *   open http://127.0.0.1:8765/
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { startMcpApiAdapter } from "mcp-api-adapter";
import {
  openWebmcpPageBridge,
  waitForCdpHttp,
} from "./cloudflare-claim/webmcp-cdp-bridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, "cloudflare-claim");

function resolveChromeBinary() {
  const fromEnv = process.env.CHROME_PATH?.trim();
  if (fromEnv) return fromEnv;
  const common = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/local/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of common) {
    if (fs.existsSync(p)) return p;
  }
  return "google-chrome";
}

function launchChrome({ cdpPort, userDataDir }) {
  const chrome = resolveChromeBinary();
  const args = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-default-apps",
    "--mute-audio",
    "about:blank",
  ];
  const child = spawn(chrome, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 8_000) stderr = stderr.slice(-4_000);
  });
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[chrome] exited code=${code} signal=${signal}\n${stderr}`);
    }
  });
  return { child, chrome, args };
}

/** MCP façade: every tool handler only calls bridge.callTool (page WebMCP). */
function createPageWebmcpProxyServer(bridge) {
  const server = new McpServer({
    name: "webmcp-page-bridge",
    version: "0.2.0",
  });

  for (const tool of bridge.tools) {
    const name = tool.name;
    const description =
      (tool.description || `WebMCP tool ${name} (executed on the live page)`) +
      " [via CDP → document.modelContext]";
    server.tool(name, description, {}, async () => {
      const result = await bridge.callTool(name, {});
      const data = result.data;
      const isError =
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === false;
      const payload = {
        ...((data && typeof data === "object" ? data : { value: data }) || {}),
        pageAudit: result.pageAudit,
        bridge: "cdp→document.modelContext",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        ...(isError ? { isError: true } : {}),
      };
    });
  }

  return server;
}

function startThirdPartySite(port, getBridge) {
  const sitePath = path.join(SITE_DIR, "site.html");
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0] ?? "/";
    if (url === "/" || url === "/index.html" || url === "/site.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(sitePath));
      return;
    }
    if (url === "/__webmcp/page-state") {
      try {
        const bridge = getBridge();
        if (!bridge) {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "CDP bridge not ready" }));
          return;
        }
        const state = await bridge.getPageState();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, state }, null, 2));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
      return;
    }
    if (url === "/__webmcp/health") {
      const bridge = getBridge();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          pageUrl: `http://127.0.0.1:${port}/`,
          bridgeReady: Boolean(bridge),
          tools: bridge?.tools?.map((t) => t.name) ?? [],
        })
      );
      return;
    }
    res.writeHead(404).end("Not found");
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  process.env.ENABLE_GRPC = process.env.ENABLE_GRPC || "1";
  process.env.ENABLE_GRPC_REFLECTION =
    process.env.ENABLE_GRPC_REFLECTION || "1";

  const grpcHost = process.env.GRPC_BIND?.trim() || "127.0.0.1";
  const grpcPort = process.env.GRPC_PORT?.trim() || "50054";
  const openApiHost = process.env.OPENAPI_HOST?.trim() || "127.0.0.1";
  const openApiPort = Number.parseInt(
    process.env.OPENAPI_PORT?.trim() || "8093",
    10
  );
  const sitePort = Number.parseInt(process.env.SITE_PORT?.trim() || "8765", 10);
  const cdpPort = Number.parseInt(process.env.CDP_PORT?.trim() || "9222", 10);
  const cdpHttpUrl =
    process.env.CLAWQL_WEBMCP_CDP_URL?.trim() ||
    `http://127.0.0.1:${cdpPort}`;
  const pageUrl = `http://127.0.0.1:${sitePort}/`;
  const skipChromeLaunch = process.env.WEBMCP_SKIP_CHROME_LAUNCH === "1";

  let bridge = null;
  const siteServer = await startThirdPartySite(sitePort, () => bridge);

  let chromeProc = null;
  let userDataDir = null;
  if (!skipChromeLaunch) {
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "clawql-webmcp-chrome-")
    );
    chromeProc = launchChrome({ cdpPort, userDataDir });
    console.log(`[chrome] launching ${chromeProc.chrome} CDP :${cdpPort}`);
    await waitForCdpHttp(cdpHttpUrl);
  } else {
    console.log(
      `[chrome] WEBMCP_SKIP_CHROME_LAUNCH=1 — using existing CDP ${cdpHttpUrl}`
    );
    await waitForCdpHttp(cdpHttpUrl);
  }

  bridge = await openWebmcpPageBridge({
    cdpHttpUrl,
    pageUrl,
  });
  console.log(
    `[webmcp] page tools via CDP: ${bridge.tools.map((t) => t.name).join(", ")}`
  );

  const grpc = await maybeStartGrpcMcpServer({
    createMcpServer: () => createPageWebmcpProxyServer(bridge),
    bindAddress: `${grpcHost}:${grpcPort}`,
  });
  if (!grpc) {
    throw new Error("gRPC did not start — set ENABLE_GRPC=1");
  }

  const gateway = await startMcpApiAdapter({
    upstream: { kind: "grpc", address: grpc.address },
    host: openApiHost,
    port: openApiPort,
    title: "WebMCP page wrap · MCP UI",
    serverName: "webmcp-page-bridge",
    apiKey: process.env.MCP_API_ADAPTER_API_KEY?.trim() || undefined,
    grpcListen: false,
  });

  console.log("");
  console.log("=== Protocol Fabric · third-party WebMCP → /mcp-ui ===");
  console.log(`Third-party WebMCP page:  ${pageUrl}`);
  console.log(`Page state probe:         ${pageUrl}__webmcp/page-state`);
  console.log(`CDP:                      ${cdpHttpUrl}`);
  console.log(`gRPC MCP (CDP proxy):     ${grpc.address}`);
  console.log(`OpenAPI /mcp-ui:          ${gateway.url}`);
  console.log(
    `Click-to-claim preset:    ${gateway.url}/mcp-ui/presets/cloudflare-claim`
  );
  console.log(
    `Tools (from page):        ${gateway
      .getCatalog()
      .tools.map((t) => t.name)
      .join(", ")}`
  );
  console.log("");
  console.log(
    "Story: page owns tools on document.modelContext → CDP bridge → MCP"
  );
  console.log(
    "       → /mcp-ui Click to claim still executes ON THE PAGE (see audit)."
  );
  console.log("");

  const shutdown = async () => {
    console.log("\nShutting down…");
    try {
      await gateway.close();
    } catch {
      /* ignore */
    }
    try {
      await grpc.shutdown();
    } catch {
      /* ignore */
    }
    try {
      await bridge?.close();
    } catch {
      /* ignore */
    }
    siteServer.close();
    if (chromeProc?.child && !chromeProc.child.killed) {
      chromeProc.child.kill("SIGTERM");
    }
    if (userDataDir) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
