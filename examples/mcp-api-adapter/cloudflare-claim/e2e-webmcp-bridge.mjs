#!/usr/bin/env node
/**
 * E2E: /mcp-ui claim against Cloudflare production WebMCP page
 * (webmcp-challenge.examples.workers.dev → reveal_extra_credits_link).
 *
 *   npm run build -w mcp-grpc-transport -w mcp-api-adapter
 *   node examples/mcp-api-adapter/cloudflare-claim/e2e-webmcp-bridge.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const serverScript = path.join(
  root,
  "examples/mcp-api-adapter/cloudflare-claim-server.mjs"
);

const SITE_PORT = process.env.SITE_PORT || "18765";
const OPENAPI_PORT = process.env.OPENAPI_PORT || "18093";
const GRPC_PORT = process.env.GRPC_PORT || "15054";
const CDP_PORT = process.env.CDP_PORT || "19222";
const PAGE_URL =
  process.env.WEBMCP_PAGE_URL ||
  "https://webmcp-challenge.examples.workers.dev/";
const TOOL = "reveal_extra_credits_link";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBridge(siteBase, { attempts = 90, delayMs = 500 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${siteBase}/__webmcp/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.bridgeReady && body.tools?.includes(TOOL)) return body;
        last = new Error("not ready: " + JSON.stringify(body));
      } else last = new Error(`HTTP ${res.status}`);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(delayMs);
  }
  throw new Error(`Timeout waiting for bridge: ${last?.message}`);
}

async function waitForUi(url, { attempts = 80, delayMs = 400 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(delayMs);
  }
  throw new Error(`Timeout waiting for ${url}: ${last?.message}`);
}

async function main() {
  const env = {
    ...process.env,
    SITE_PORT,
    OPENAPI_PORT,
    GRPC_PORT,
    CDP_PORT,
    WEBMCP_PAGE_URL: PAGE_URL,
    ENABLE_GRPC: "1",
    ENABLE_GRPC_REFLECTION: "1",
  };

  const child = spawn(process.execPath, [serverScript], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (c) => process.stdout.write(c));
  child.stderr.on("data", (c) => process.stderr.write(c));

  const kill = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("exit", kill);
  process.on("SIGINT", () => {
    kill();
    process.exit(130);
  });

  try {
    const siteBase = `http://127.0.0.1:${SITE_PORT}`;
    const uiBase = `http://127.0.0.1:${OPENAPI_PORT}`;

    await waitForBridge(siteBase);
    await waitForUi(`${uiBase}/mcp-ui`);

    const before = await (await fetch(`${siteBase}/__webmcp/page-state`)).json();
    if (before.state?.dialogOpen) {
      throw new Error("dialog already open before claim");
    }

    const claim = await fetch(`${uiBase}/mcp-ui/execute/${TOOL}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    if (claim.status !== 200) {
      throw new Error(
        `claim HTTP ${claim.status}: ${(await claim.text()).slice(0, 500)}`
      );
    }
    const claimHtml = await claim.text();

    const after = await (await fetch(`${siteBase}/__webmcp/page-state`)).json();
    const redeem =
      after.state?.redeemUrl ||
      (claimHtml.match(/https:\/\/[a-z0-9.-]*redeem[a-z0-9.-]*\.pages\.dev\/[^\"\s]+/i) ||
        [])[0];
    if (!after.state?.dialogOpen) {
      throw new Error("dialog not open after tool: " + JSON.stringify(after));
    }
    if (!redeem || !/redeem\.pages\.dev|credits|cloudflare/i.test(String(redeem))) {
      throw new Error("missing production redeem URL: " + JSON.stringify(after));
    }

    const landing = await fetch(`${uiBase}/mcp-ui/presets/cloudflare-claim`);
    if (!landing.ok) throw new Error(`preset HTTP ${landing.status}`);
    const landingHtml = await landing.text();
    if (!landingHtml.includes(TOOL) && !landingHtml.includes("Click")) {
      console.warn("preset landing missing expected strings");
    }

    console.log("\nE2E OK — production WebMCP claim via /mcp-ui");
    console.log(JSON.stringify({ pageUrl: PAGE_URL, tool: TOOL, redeemUrl: redeem }, null, 2));
  } finally {
    kill();
    await sleep(800);
  }
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
