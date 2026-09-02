#!/usr/bin/env node
/**
 * Protocol Fabric demo: third-party WebMCP coupon tools → /mcp-ui click-to-claim.
 *
 * Mirrors tools a Cloudflare-style challenge page would register via WebMCP, so
 * mcp-api-adapter can re-humanize them without live CDP.
 *
 *   npm run build -w mcp-grpc-transport -w mcp-api-adapter
 *   node examples/mcp-api-adapter/cloudflare-claim-server.mjs
 *   open http://127.0.0.1:8093/mcp-ui/presets/cloudflare-claim
 *   open http://127.0.0.1:8765/   # third-party WebMCP page
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { startMcpApiAdapter } from "mcp-api-adapter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, "cloudflare-claim");

const state = {
  revealed: false,
  claimed: false,
  coupon: null,
  challengeId: null,
};

function createCloudflareClaimServer() {
  const server = new McpServer({
    name: "cloudflare-claim-demo",
    version: "0.1.0",
  });

  server.tool(
    "cf_reveal_challenge",
    "Reveal a Cloudflare-style challenge coupon for agents (demo). Unlocks cf_claim_coupon.",
    {},
    async () => {
      state.revealed = true;
      state.challengeId = `ch_${randomBytes(4).toString("hex")}`;
      const payload = {
        ok: true,
        source: "webmcp://challenge.example/coupon",
        challengeId: state.challengeId,
        message:
          "Coupon unlocked for agents. Humans can claim via /mcp-ui click-to-claim.",
        next: "cf_claim_coupon",
        revealedAt: new Date().toISOString(),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  server.tool(
    "cf_claim_coupon",
    "Claim the challenge coupon (demo). Same tool agents call — mcp-ui renders Click to claim.",
    {},
    async () => {
      if (!state.revealed) {
        const payload = {
          ok: false,
          error: "Challenge not revealed yet. Call cf_reveal_challenge first.",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: true,
        };
      }
      if (!state.coupon) {
        state.coupon = `CF-DEMO-${randomBytes(3).toString("hex").toUpperCase()}`;
      }
      state.claimed = true;
      const payload = {
        ok: true,
        challengeId: state.challengeId,
        claimedAt: new Date().toISOString(),
        couponCode: state.coupon,
        reward: "Protocol Fabric sticker pack (metaphorical)",
        note: "Issued by the third-party WebMCP challenge page, claimed through ClawQL /mcp-ui.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }
  );

  return server;
}

function startThirdPartySite(port) {
  const sitePath = path.join(SITE_DIR, "site.html");
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html" || req.url === "/site.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(sitePath));
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

  const siteServer = await startThirdPartySite(sitePort);

  const grpc = await maybeStartGrpcMcpServer({
    createMcpServer: createCloudflareClaimServer,
    bindAddress: `${grpcHost}:${grpcPort}`,
  });
  if (!grpc) {
    throw new Error("gRPC did not start — set ENABLE_GRPC=1");
  }

  const gateway = await startMcpApiAdapter({
    upstream: { kind: "grpc", address: grpc.address },
    host: openApiHost,
    port: openApiPort,
    title: "Cloudflare-style claim · MCP UI",
    serverName: "cloudflare-claim-demo",
    apiKey: process.env.MCP_API_ADAPTER_API_KEY?.trim() || undefined,
    grpcListen: false,
  });

  console.log("");
  console.log("=== Protocol Fabric · click-to-claim demo ===");
  console.log(`Third-party WebMCP page:  http://127.0.0.1:${sitePort}/`);
  console.log(`gRPC MCP (indexed tools): ${grpc.address}`);
  console.log(`OpenAPI /mcp-ui:          ${gateway.url}`);
  console.log(
    `Click-to-claim preset:    ${gateway.url}/mcp-ui/presets/cloudflare-claim`
  );
  console.log(
    `Tools:                    ${gateway
      .getCatalog()
      .tools.map((t) => t.name)
      .join(", ")}`
  );
  console.log("");
  console.log(
    "Story: site registers WebMCP tools for agents → ClawQL/mcp-ui turns"
  );
  console.log(
    "       cf_claim_coupon into a human Click to claim button."
  );
  console.log("");

  const shutdown = async () => {
    console.log("\nShutting down…");
    await gateway.close();
    await grpc.shutdown();
    siteServer.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
