#!/usr/bin/env node
/**
 * WebMCP CDP smoke test for PixelDrop upload_photo.
 *
 * Exercises discovery → execute via document.modelContext (not the harness
 * iframe bypass). Requires Chrome preview with WebMCP + CDP.
 *
 *   cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765 &
 *   google-chrome --remote-debugging-port=9222 ...  # WebMCP-enabled preview
 *   node webmcp-cdp-smoke.mjs
 *
 * Options:
 *   --page-url   default http://127.0.0.1:8765/pixeldrop-broken-demo.html
 *   --cdp-url    default http://127.0.0.1:9222
 *   --ready-ms   ms to wait after page load (default 2000)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** 1×1 red JPEG, base64 payload only */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ/4AD//2Q==";

async function resolveWsUrl(cdpUrl) {
  const base = cdpUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`CDP /json/version → HTTP ${res.status}`);
  const body = await res.json();
  if (!body.webSocketDebuggerUrl) throw new Error("CDP missing webSocketDebuggerUrl");
  return body.webSocketDebuggerUrl;
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => reject(new Error("CDP connect timeout")), 15_000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      let nextId = 1;
      const pending = new Map();
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id != null && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message ?? "CDP error"));
          else p.resolve(msg.result ?? {});
        }
      });
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej });
            ws.send(JSON.stringify(payload));
          });
        },
        close: () => ws.close(),
      });
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("CDP WebSocket failed"));
    });
  });
}

async function main() {
  const pageUrl = arg("--page-url", "http://127.0.0.1:8765/pixeldrop-broken-demo.html");
  const cdpUrl = arg("--cdp-url", process.env.CLAWQL_WEBMCP_CDP_URL ?? "http://127.0.0.1:9222");
  const readyMs = Number(arg("--ready-ms", "2000"));

  console.log("WebMCP CDP smoke — PixelDrop upload_photo");
  console.log("  page:", pageUrl);
  console.log("  cdp: ", cdpUrl);

  // Prefer built clawql-api helpers when available
  const adapterPath = join(repoRoot, "packages/clawql-api/dist/webmcp/webmcp-browser.js");
  try {
    const { accessSync } = await import("node:fs");
    accessSync(adapterPath);
    const { Effect } = await import("effect");
    const {
      openWebmcpPageSessionEffect,
      discoverWebmcpToolsEffect,
      executeWebmcpToolEffect,
    } = await import(adapterPath);

    const program = Effect.gen(function* () {
      const session = yield* openWebmcpPageSessionEffect({ cdpUrl, pageUrl, readyMs });
      try {
        const tools = yield* discoverWebmcpToolsEffect(session);
        console.log("Discovered tools:", tools.map((t) => t.name).join(", ") || "(none)");
        const upload = tools.find((t) => t.name === "upload_photo");
        if (!upload) {
          return yield* Effect.fail(new Error('upload_photo not found — is WebMCP enabled on this page?'));
        }
        const result = yield* executeWebmcpToolEffect(session, "upload_photo", {
          file: TINY_JPEG_B64,
          filename: "cdp-smoke.jpg",
          caption: "webmcp-cdp-smoke",
        });
        return result;
      } finally {
        yield* Effect.promise(() => session.close());
      }
    });

    const result = await Effect.runPromise(program);
    console.log("Execute result:", JSON.stringify(result, null, 2));
    if (result?.uploadId) {
      console.log("\nPASS: WebMCP discovery → execute returned uploadId:", result.uploadId);
      return;
    }
    throw new Error("Execute succeeded but missing uploadId");
  } catch (e) {
    if (e.code !== "ENOENT" && !String(e.message).includes("Cannot find module")) {
      throw e;
    }
    console.log("(clawql-api not built — using inline CDP fallback)\n");
  }

  const wsUrl = await resolveWsUrl(cdpUrl);
  const browser = await connectCdp(wsUrl);
  try {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);

    await send("Page.enable");
    await send("Page.navigate", { url: pageUrl });
    await new Promise((r) => setTimeout(r, readyMs + 1000));

    const discoverExpr = `(async () => {
      const mc = document.modelContext;
      if (!mc?.getTools) return { ok: false, error: "WebMCP not available" };
      const tools = await mc.getTools();
      return { ok: true, tools: tools.map(t => t.name) };
    })()`;

    const discovered = await send("Runtime.evaluate", {
      expression: discoverExpr,
      awaitPromise: true,
      returnByValue: true,
    });
    const disc = discovered.result?.value;
    if (!disc?.ok) {
      throw new Error(disc?.error ?? "Discovery failed — need Chrome preview with WebMCP");
    }
    console.log("Discovered tools:", disc.tools?.join(", ") ?? "(none)");
    if (!disc.tools?.includes("upload_photo")) {
      throw new Error("upload_photo not registered on page");
    }

    const inputJson = JSON.stringify({
      file: TINY_JPEG_B64,
      filename: "cdp-smoke.jpg",
      caption: "webmcp-cdp-smoke",
    });
    const executeExpr = `(async () => {
      const mc = document.modelContext;
      const tools = await mc.getTools();
      const tool = tools.find(t => t.name === "upload_photo");
      const result = await mc.executeTool(tool, ${inputJson});
      try { return JSON.parse(result); } catch { return { raw: result }; }
    })()`;

    const executed = await send("Runtime.evaluate", {
      expression: executeExpr,
      awaitPromise: true,
      returnByValue: true,
    });
    const result = executed.result?.value;
    if (executed.exceptionDetails) {
      throw new Error(executed.exceptionDetails.text ?? "Execute threw");
    }
    console.log("Execute result:", JSON.stringify(result, null, 2));
    if (!result?.uploadId) throw new Error("Missing uploadId in execute result");
    console.log("\nPASS: WebMCP discovery → execute returned uploadId:", result.uploadId);
  } finally {
    browser.close();
  }
}

main().catch((err) => {
  console.error("\nFAIL:", err.message);
  console.error(`
Prerequisites:
  1. Serve PixelDrop:  cd examples/mcp-api-adapter/pixeldrop && python3 -m http.server 8765
  2. Chrome preview with WebMCP + CDP on port 9222
  3. See VERIFICATION.md Priority 2 for full checklist
`);
  process.exit(1);
});
