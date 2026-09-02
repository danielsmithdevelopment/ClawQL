#!/usr/bin/env node
/**
 * CDP → page WebMCP bridge.
 *
 * Does NOT reimplement page tools. tools/list and tools/call go through
 * Chrome CDP → document.modelContext.getTools() / executeTool().
 *
 * For production pages (e.g. Cloudflare's webmcp-challenge) that call
 * document.modelContext.registerTool when native WebMCP is absent, we inject
 * a same-surface polyfill via Page.addScriptToEvaluateOnNewDocument before
 * navigation so the page's tools actually register.
 */
import { randomUUID } from "node:crypto";

export async function resolveCdpWebSocketUrl(cdpHttpUrl) {
  const base = cdpHttpUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/json/version`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`CDP /json/version → HTTP ${res.status}`);
  const body = await res.json();
  if (!body.webSocketDebuggerUrl) {
    throw new Error("CDP missing webSocketDebuggerUrl");
  }
  return body.webSocketDebuggerUrl;
}

export async function waitForCdpHttp(
  cdpHttpUrl,
  { attempts = 60, delayMs = 250 } = {}
) {
  const base = cdpHttpUrl.replace(/\/$/, "");
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${base}/json/version`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `CDP not ready at ${base}: ${lastErr?.message ?? "unknown"}`
  );
}

export function connectCdp(wsUrl) {
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
          const payload = sessionId
            ? { id, method, params, sessionId }
            : { id, method, params };
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

/**
 * Polyfill injected before page JS. Mirrors enough of document.modelContext
 * for Cloudflare's registerTool + our getTools/executeTool discovery path.
 */
export const WEBMCP_POLYFILL_SOURCE = `(() => {
  const existing = document.modelContext || navigator.modelContext;
  if (existing && typeof existing.registerTool === "function") {
    if (typeof existing.getTools !== "function") {
      // Native surface without list/execute helpers — wrap lightly.
    } else {
      return;
    }
  }
  const tools = [];
  const polyfill = {
    registerTool(tool) {
      if (!tool || !tool.name) throw new Error("registerTool requires name");
      const idx = tools.findIndex((t) => t.name === tool.name);
      if (idx >= 0) tools[idx] = tool;
      else tools.push(tool);
      return { name: tool.name };
    },
    async getTools() {
      return tools.slice();
    },
    async executeTool(toolOrName, inputJson) {
      const name =
        typeof toolOrName === "string"
          ? toolOrName
          : toolOrName && toolOrName.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error("Unknown WebMCP tool: " + name);
      let args = {};
      if (typeof inputJson === "string" && inputJson.trim()) {
        args = JSON.parse(inputJson);
      } else if (inputJson && typeof inputJson === "object") {
        args = inputJson;
      }
      const execute = tool.execute || tool.handler;
      if (typeof execute !== "function") {
        throw new Error("Tool has no execute(): " + name);
      }
      return await execute(args);
    },
  };
  try {
    Object.defineProperty(document, "modelContext", {
      value: polyfill,
      configurable: true,
      writable: true,
    });
  } catch {
    document.modelContext = polyfill;
  }
  window.__clawqlWebmcpPolyfill = true;
})();`;

const DISCOVER_EXPR = `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.getTools !== "function") {
    return { ok: false, error: "document.modelContext.getTools unavailable", tools: [] };
  }
  const tools = await mc.getTools();
  return {
    ok: true,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    })),
  };
})()`;

const PAGE_STATE_EXPR = `(async () => {
  const dialog = document.querySelector("dialog.credits-dialog");
  const cta = dialog?.querySelector("a.credits-dialog-cta");
  const audit = window.__clawqlWebmcpPageState || null;
  return {
    ok: true,
    state: {
      polyfill: Boolean(window.__clawqlWebmcpPolyfill),
      dialogOpen: Boolean(dialog?.open),
      redeemUrl: cta?.href || null,
      redeemLabel: cta?.textContent?.trim() || null,
      pageUrl: location.href,
      audit,
    },
  };
})()`;

function executeExpr(toolName, args) {
  const nameJson = JSON.stringify(toolName);
  const argsJson = JSON.stringify(args ?? {});
  return `(async () => {
  const mc = document.modelContext || navigator.modelContext;
  if (!mc?.getTools || !mc?.executeTool) {
    throw new Error("document.modelContext.executeTool unavailable");
  }
  const tools = await mc.getTools();
  const tool = tools.find((t) => t.name === ${nameJson});
  if (!tool) throw new Error("Tool not on page: " + ${nameJson});
  const result = await mc.executeTool(tool, JSON.stringify(${argsJson}));
  // Give the page a tick to open dialogs / mutate DOM
  await new Promise((r) => setTimeout(r, 50));
  const dialog = document.querySelector("dialog.credits-dialog");
  const cta = dialog?.querySelector("a.credits-dialog-cta");
  let data = result;
  if (typeof result === "string") {
    try { data = JSON.parse(result); } catch { data = { raw: result }; }
  }
  // MCP CallToolResult shape from Cloudflare page
  if (data && typeof data === "object" && Array.isArray(data.content)) {
    data = {
      ...data,
      text: data.content.map((c) => c.text).filter(Boolean).join("\\n"),
    };
  }
  return {
    ok: true,
    data,
    pageAudit: {
      dialogOpen: Boolean(dialog?.open),
      redeemUrl: cta?.href || null,
      redeemLabel: cta?.textContent?.trim() || null,
      pageUrl: location.href,
      polyfill: Boolean(window.__clawqlWebmcpPolyfill),
    },
  };
})()`;
}

/**
 * Open a CDP page session navigated to pageUrl and keep it for tool calls.
 */
export async function openWebmcpPageBridge({
  cdpHttpUrl,
  pageUrl,
  readyMs = 800,
  discoverAttempts = 40,
  discoverDelayMs = 250,
  injectPolyfill = true,
}) {
  const wsUrl = await resolveCdpWebSocketUrl(cdpHttpUrl);
  const browser = await connectCdp(wsUrl);
  const { targetId } = await browser.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await browser.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const send = (method, params) => browser.send(method, params, sessionId);

  await send("Page.enable");
  await send("Runtime.enable");
  if (injectPolyfill) {
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: WEBMCP_POLYFILL_SOURCE,
    });
  }
  await send("Page.navigate", { url: pageUrl });
  if (readyMs > 0) {
    await new Promise((r) => setTimeout(r, readyMs));
  }

  async function listTools() {
    const evaluated = await send("Runtime.evaluate", {
      expression: DISCOVER_EXPR,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) {
      const detail = evaluated.exceptionDetails;
      const msg =
        detail.exception?.description ||
        detail.text ||
        "WebMCP discovery threw";
      throw new Error(msg);
    }
    const value = evaluated.result?.value;
    if (!value?.ok) {
      throw new Error(value?.error ?? "WebMCP discovery failed");
    }
    return value.tools ?? [];
  }

  async function callTool(name, args = {}) {
    const evaluated = await send("Runtime.evaluate", {
      expression: executeExpr(name, args),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) {
      throw new Error(
        evaluated.exceptionDetails.text ?? `executeTool(${name}) threw`
      );
    }
    const value = evaluated.result?.value;
    if (!value?.ok) {
      throw new Error(`executeTool(${name}) returned no result`);
    }
    return value;
  }

  async function getPageState() {
    const evaluated = await send("Runtime.evaluate", {
      expression: PAGE_STATE_EXPR,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) {
      throw new Error(
        evaluated.exceptionDetails.text ?? "page state probe threw"
      );
    }
    const value = evaluated.result?.value;
    if (!value?.ok) {
      throw new Error(value?.error ?? "page state unavailable");
    }
    return value.state;
  }

  async function close() {
    try {
      await browser.send("Target.closeTarget", { targetId });
    } catch {
      /* ignore */
    }
    browser.close();
  }

  let tools = [];
  let lastErr;
  for (let i = 0; i < discoverAttempts; i++) {
    try {
      tools = await listTools();
      if (tools.length > 0) break;
      lastErr = new Error("WebMCP tools empty (page still booting?)");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((r) => setTimeout(r, discoverDelayMs));
  }
  if (tools.length === 0) {
    await close();
    throw lastErr ?? new Error("WebMCP discovery failed");
  }

  return {
    id: randomUUID(),
    pageUrl,
    tools,
    listTools,
    callTool,
    getPageState,
    close,
  };
}
