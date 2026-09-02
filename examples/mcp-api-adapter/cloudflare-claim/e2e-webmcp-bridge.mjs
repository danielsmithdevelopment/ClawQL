#!/usr/bin/env node
/**
 * E2E: prove /mcp-ui claim executes document.modelContext tools on the page
 * (not a Node-side mock coupon mint).
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, { attempts = 80, delayMs = 400 } = {}) {
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
    ENABLE_GRPC: "1",
    ENABLE_GRPC_REFLECTION: "1",
  };

  const child = spawn(process.execPath, [serverScript], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  child.stdout.on("data", (c) => {
    out += String(c);
    process.stdout.write(c);
  });
  child.stderr.on("data", (c) => {
    out += String(c);
    process.stderr.write(c);
  });

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

    await waitFor(`${siteBase}/__webmcp/health`);
    const health = await (await fetch(`${siteBase}/__webmcp/health`)).json();
    if (!health.bridgeReady) {
      throw new Error("bridge not ready: " + JSON.stringify(health));
    }
    if (!health.tools?.includes("cf_claim_coupon")) {
      throw new Error("page tools missing claim: " + JSON.stringify(health));
    }

    await waitFor(`${uiBase}/mcp-ui`);

    const before = await (await fetch(`${siteBase}/__webmcp/page-state`)).json();
    if (before.state?.calls?.length) {
      throw new Error("expected empty page audit before claim");
    }

    // Reveal via mcp-ui execute (same path claim button uses)
    const reveal = await fetch(`${uiBase}/mcp-ui/execute/cf_reveal_challenge`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
      redirect: "manual",
    });
    if (![200, 302, 303].includes(reveal.status) && reveal.status !== 201) {
      const body = await reveal.text();
      // HTMX fragment responses are usually 200
      if (reveal.status !== 200) {
        throw new Error(`reveal failed HTTP ${reveal.status}: ${body.slice(0, 400)}`);
      }
    }

    const mid = await (await fetch(`${siteBase}/__webmcp/page-state`)).json();
    if (!mid.state?.revealed) {
      throw new Error("page state not revealed after MCP execute: " + JSON.stringify(mid));
    }
    if (!mid.state.calls?.some((c) => c.name === "cf_reveal_challenge")) {
      throw new Error("page audit missing reveal call: " + JSON.stringify(mid));
    }

    const claim = await fetch(`${uiBase}/mcp-ui/execute/cf_claim_coupon`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "",
    });
    if (claim.status !== 200) {
      throw new Error(`claim failed HTTP ${claim.status}: ${(await claim.text()).slice(0, 400)}`);
    }
    const claimHtml = await claim.text();
    if (!claimHtml.includes("CF-PAGE-") && !claimHtml.includes("couponCode")) {
      // Accept either structured text in fragment
      console.warn("claim HTML did not obviously include coupon; checking page state");
    }

    const after = await (await fetch(`${siteBase}/__webmcp/page-state`)).json();
    if (!after.state?.claimed || !after.state?.couponCode) {
      throw new Error("page did not claim via WebMCP: " + JSON.stringify(after));
    }
    if (!String(after.state.couponCode).startsWith("CF-PAGE-")) {
      throw new Error(
        "coupon must be minted on the page (CF-PAGE-*), got " + after.state.couponCode
      );
    }
    if (!after.state.calls?.some((c) => c.name === "cf_claim_coupon")) {
      throw new Error("page audit missing claim call: " + JSON.stringify(after));
    }

    // Preset landing still works
    const landing = await fetch(`${uiBase}/mcp-ui/presets/cloudflare-claim`);
    if (!landing.ok) {
      throw new Error(`preset landing HTTP ${landing.status}`);
    }

    console.log("\nE2E OK — mcp-ui execute hit document.modelContext on the page");
    console.log(JSON.stringify(after.state, null, 2));
  } finally {
    kill();
    await sleep(500);
  }
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
