/**
 * Minimal CDP client for WebMCP page tool discovery and execution.
 * Requires Chromium with WebMCP enabled (Chrome preview) and a CDP endpoint.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */

import { Effect } from "effect";

export type WebmcpDiscoveredTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object | null;
};

export type WebmcpBrowserSession = {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

type CdpResponse = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string; code?: number };
  sessionId?: string;
};

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const DEFAULT_READY_MS = 2_000;

export function resolveWebmcpCdpUrl(explicit?: string): string {
  const fromEnv = process.env.CLAWQL_WEBMCP_CDP_URL?.trim();
  return explicit?.trim() || fromEnv || DEFAULT_CDP_URL;
}

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Resolve `http(s)://host:9222` → browser WebSocket debugger URL, or pass through `ws(s):`. */
export function resolveCdpWebSocketUrlEffect(
  cdpUrl: string,
  fetchImpl: typeof fetch = fetch
): Effect.Effect<string, Error> {
  return fromPromise(async () => {
    const trimmed = cdpUrl.trim();
    if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
      return trimmed;
    }
    const base = trimmed.replace(/\/$/, "");
    const versionUrl = /\/json(\/|$)/.test(base) ? base : `${base}/json/version`;
    const res = await fetchImpl(versionUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`CDP version endpoint failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { webSocketDebuggerUrl?: string };
    if (!body.webSocketDebuggerUrl?.trim()) {
      throw new Error("CDP /json/version missing webSocketDebuggerUrl");
    }
    return body.webSocketDebuggerUrl.trim();
  });
}

async function connectCdp(wsUrl: string): Promise<{
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ): Promise<Record<string, unknown>>;
  on(event: string, handler: (params: Record<string, unknown>) => void): void;
  close(): Promise<void>;
}> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("CDP WebSocket connect timeout")), 15_000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("CDP WebSocket connection failed"));
    });
  });

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

  ws.addEventListener("message", (ev) => {
    const data = typeof ev.data === "string" ? ev.data : String(ev.data);
    let msg: CdpResponse;
    try {
      msg = JSON.parse(data) as CdpResponse;
    } catch {
      return;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error.message ?? `CDP error ${msg.error.code ?? "?"}`));
      } else {
        p.resolve(msg.result ?? {});
      }
      return;
    }
    if (msg.method) {
      const set = listeners.get(msg.method);
      if (set) {
        for (const h of set) h(msg.params ?? {});
      }
    }
  });

  const sendRaw = (
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      const payload: Record<string, unknown> = { id, method, params: params ?? {} };
      if (sessionId) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  };

  return {
    send(method, params, sessionId) {
      return sendRaw(method, params, sessionId);
    },
    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
    },
    async close() {
      ws.close();
    },
  };
}

function waitForLoadEvent(
  browser: { on(event: string, handler: (params: Record<string, unknown>) => void): void },
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), timeoutMs);
    browser.on("Page.loadEventFired", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export type OpenWebmcpSessionOptions = {
  cdpUrl?: string;
  pageUrl: string;
  readyMs?: number;
  fetchImpl?: typeof fetch;
};

/** Open a persistent CDP page session navigated to a WebMCP-enabled page. */
export function openWebmcpPageSessionEffect(
  options: OpenWebmcpSessionOptions
): Effect.Effect<WebmcpBrowserSession, Error> {
  return Effect.gen(function* () {
    const cdpUrl = resolveWebmcpCdpUrl(options.cdpUrl);
    const readyMs = options.readyMs ?? DEFAULT_READY_MS;
    const fetchImpl = options.fetchImpl ?? fetch;
    const wsUrl = yield* resolveCdpWebSocketUrlEffect(cdpUrl, fetchImpl);
    const browser = yield* fromPromise(() => connectCdp(wsUrl));

    const created = yield* fromPromise(() =>
      browser.send("Target.createTarget", { url: "about:blank" })
    );
    const targetId = String(created.targetId ?? "");
    if (!targetId) {
      yield* fromPromise(() => browser.close());
      return yield* Effect.fail(new Error("Target.createTarget missing targetId"));
    }

    const attached = yield* fromPromise(() =>
      browser.send("Target.attachToTarget", { targetId, flatten: true })
    );
    const sessionId = String(attached.sessionId ?? "");
    const send = (method: string, params?: Record<string, unknown>) =>
      sessionId ? browser.send(method, params, sessionId) : browser.send(method, params);

    yield* fromPromise(() => send("Page.enable"));
    const loadPromise = waitForLoadEvent(browser, 30_000);
    yield* fromPromise(() => send("Page.navigate", { url: options.pageUrl }));
    yield* fromPromise(() => loadPromise);
    if (readyMs > 0) {
      yield* fromPromise(() => new Promise((r) => setTimeout(r, readyMs)));
    }

    return {
      send,
      async close() {
        try {
          await browser.send("Target.closeTarget", { targetId });
        } catch {
          /* ignore */
        }
        await browser.close();
      },
    };
  });
}

const DISCOVER_TOOLS_EXPRESSION = `(async () => {
  const mc = document.modelContext;
  if (!mc || typeof mc.getTools !== "function") {
    return { ok: false, error: "WebMCP not available (needs Chrome preview with WebMCP + secure context)", tools: [] };
  }
  const tools = await mc.getTools();
  return {
    ok: true,
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title || "",
      description: t.description || "",
      inputSchema: t.inputSchema || null,
    })),
  };
})()`;

export function discoverWebmcpToolsEffect(
  session: WebmcpBrowserSession
): Effect.Effect<WebmcpDiscoveredTool[], Error> {
  return Effect.gen(function* () {
    const evaluated = yield* fromPromise(() =>
      session.send("Runtime.evaluate", {
        expression: DISCOVER_TOOLS_EXPRESSION,
        awaitPromise: true,
        returnByValue: true,
      })
    );
    const value = (
      evaluated.result as {
        value?: { ok?: boolean; error?: string; tools?: WebmcpDiscoveredTool[] };
      }
    )?.value;
    if (!value?.ok) {
      return yield* Effect.fail(new Error(value?.error ?? "WebMCP tool discovery failed"));
    }
    return value.tools ?? [];
  });
}

export function executeWebmcpToolEffect(
  session: WebmcpBrowserSession,
  toolName: string,
  input: Record<string, unknown>
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const inputJson = JSON.stringify(input);
    const toolNameJson = JSON.stringify(toolName);
    const expression = `(async () => {
      const mc = document.modelContext;
      if (!mc?.getTools || !mc?.executeTool) throw new Error("WebMCP not available");
      const toolName = ${toolNameJson};
      // Chrome Imperative API: executeTool(tool, inputJsonString)
      const inputJson = ${JSON.stringify(inputJson)};
      const tools = await mc.getTools();
      const tool = tools.find((t) => t.name === toolName);
      if (!tool) throw new Error("Tool not found: " + toolName);
      const result = await mc.executeTool(tool, inputJson);
      try {
        return { ok: true, data: typeof result === "string" ? JSON.parse(result) : result, rawType: typeof result };
      } catch {
        return { ok: true, data: result, rawType: typeof result };
      }
    })()`;

    const evaluated = yield* fromPromise(() =>
      session.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    );

    const remoteError = (evaluated.exceptionDetails as { text?: string } | undefined)?.text;
    if (remoteError) {
      return yield* Effect.fail(new Error(remoteError));
    }

    const value = (evaluated.result as { value?: { ok?: boolean; data?: unknown } })?.value;
    if (!value?.ok) {
      return yield* Effect.fail(new Error("WebMCP executeTool returned no result"));
    }
    return value.data;
  });
}
