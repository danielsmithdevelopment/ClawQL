/**
 * Minimal Chromium DevTools Protocol client (no Playwright/Puppeteer dependency).
 * Supports fetch (DOM text/html), screenshot, and basic interact steps over CDP WebSocket.
 */

import type { BrowserStep, PageContent } from "../../interfaces.js";

type CdpResponse = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string; code?: number };
  sessionId?: string;
};

export type CdpSessionClient = {
  send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  sendSession(
    sessionId: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  on(event: string, handler: (params: Record<string, unknown>) => void): void;
  close(): Promise<void>;
};

/** Resolve `http(s)://host:9222` → browser WebSocket debugger URL, or pass through `ws(s):`. */
export async function resolveCdpWebSocketUrl(
  cdpUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
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
}

export async function connectCdpWithSessions(wsUrl: string): Promise<CdpSessionClient> {
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
    send(method, params) {
      return sendRaw(method, params);
    },
    sendSession(sessionId, method, params) {
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

async function withTargetSession<T>(
  cdpUrl: string,
  fetchImpl: typeof fetch,
  fn: (send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>, browser: CdpSessionClient, targetId: string) => Promise<T>
): Promise<T> {
  const browserWs = await resolveCdpWebSocketUrl(cdpUrl, fetchImpl);
  const browser = await connectCdpWithSessions(browserWs);
  try {
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const targetId = String(created.targetId ?? "");
    if (!targetId) throw new Error("Target.createTarget missing targetId");
    const attached = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = String(attached.sessionId ?? "");
    const send = (method: string, params?: Record<string, unknown>) =>
      sessionId ? browser.sendSession(sessionId, method, params) : browser.send(method, params);
    try {
      return await fn(send, browser, targetId);
    } finally {
      try {
        await browser.send("Target.closeTarget", { targetId });
      } catch {
        /* ignore */
      }
    }
  } finally {
    await browser.close();
  }
}

function waitForLoadEvent(browser: CdpSessionClient, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(), timeoutMs);
    browser.on("Page.loadEventFired", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

export async function cdpNavigateAndGetContent(
  cdpUrl: string,
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; providerId?: string } = {}
): Promise<PageContent> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const provider = options.providerId ?? "chromium";

  return withTargetSession(cdpUrl, fetchImpl, async (send, browser) => {
    await send("Page.enable");
    const loadPromise = waitForLoadEvent(browser, timeoutMs);
    await send("Page.navigate", { url });
    await loadPromise;

    const evaluated = await send("Runtime.evaluate", {
      expression:
        "({ title: document.title || '', html: document.documentElement ? document.documentElement.outerHTML : '', text: document.body ? document.body.innerText : '' })",
      returnByValue: true,
    });
    const value = (evaluated.result as { value?: { title?: string; html?: string; text?: string } })
      ?.value;
    const html = value?.html ?? "";
    const text = value?.text ?? "";
    return {
      url,
      title: value?.title ?? "",
      html,
      text,
      markdown: text || html,
      provider,
    };
  });
}

export async function cdpScreenshot(
  cdpUrl: string,
  url: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return withTargetSession(cdpUrl, fetchImpl, async (send, browser) => {
    await send("Page.enable");
    const loadPromise = waitForLoadEvent(browser, timeoutMs);
    await send("Page.navigate", { url });
    await loadPromise;
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const b64 = String(shot.data ?? "");
    return Uint8Array.from(Buffer.from(b64, "base64"));
  });
}

export async function cdpInteract(
  cdpUrl: string,
  url: string,
  steps: BrowserStep[],
  options: { timeoutMs?: number; fetchImpl?: typeof fetch; providerId?: string } = {}
): Promise<PageContent> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const provider = options.providerId ?? "chromium";

  return withTargetSession(cdpUrl, fetchImpl, async (send, browser) => {
    await send("Page.enable");
    const loadPromise = waitForLoadEvent(browser, timeoutMs);
    await send("Page.navigate", { url });
    await loadPromise;

    for (const step of steps) {
      if (step.action === "wait") {
        await new Promise((r) => setTimeout(r, Math.max(0, step.ms)));
        continue;
      }
      if (step.action === "navigate") {
        await send("Page.navigate", { url: step.url });
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (step.action === "click") {
        const sel = JSON.stringify(step.selector);
        await send("Runtime.evaluate", {
          expression: `(() => { const el = document.querySelector(${sel}); if (!el) throw new Error('selector not found'); el.click(); return true; })()`,
          awaitPromise: true,
        });
        continue;
      }
      if (step.action === "type") {
        const sel = JSON.stringify(step.selector);
        const text = JSON.stringify(step.text);
        await send("Runtime.evaluate", {
          expression: `(() => { const el = document.querySelector(${sel}); if (!el) throw new Error('selector not found'); el.focus(); if ('value' in el) el.value = ${text}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
          awaitPromise: true,
        });
      }
    }

    const evaluated = await send("Runtime.evaluate", {
      expression:
        "({ title: document.title || '', html: document.documentElement ? document.documentElement.outerHTML : '', text: document.body ? document.body.innerText : '' })",
      returnByValue: true,
    });
    const value = (evaluated.result as { value?: { title?: string; html?: string; text?: string } })
      ?.value;
    return {
      url,
      title: value?.title ?? "",
      html: value?.html ?? "",
      text: value?.text ?? "",
      markdown: value?.text || value?.html || "",
      provider,
    };
  });
}
