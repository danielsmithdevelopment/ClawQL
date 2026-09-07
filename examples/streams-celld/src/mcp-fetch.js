/**
 * Tiny Streamable HTTP MCP client for celld / Workers.
 * No @modelcontextprotocol/sdk — keeps the DO bundle ≪ 64 MiB.
 *
 * Prefers MCP 2026-07-28 (stateless tools/call, no session affinity).
 * Parses JSON or SSE `data:` bodies (server may default to SSE unless
 * CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1 on clawql-mcp).
 */

/** @typedef {{ url: string, bearer?: string, timeoutMs?: number }} McpFetchConfig */

/**
 * @param {string} text
 * @param {string} [contentType]
 */
export function parseMcpHttpBody(text, contentType = "") {
  const ctype = (contentType || "").toLowerCase();
  if (ctype.includes("text/event-stream") || text.startsWith("event:")) {
    for (const line of text.split("\n")) {
      if (line.startsWith("data:")) {
        const payload = line.slice("data:".length).trim();
        if (payload) return JSON.parse(payload);
      }
    }
    return { raw: text };
  }
  if (!text.trim()) return {};
  return JSON.parse(text);
}

/**
 * @param {unknown} rpc
 */
export function unwrapToolsCallResult(rpc) {
  if (!rpc || typeof rpc !== "object") {
    return { ok: false, error: "empty MCP response", rpc };
  }
  const obj = /** @type {{ error?: { message?: string }, result?: { content?: unknown[], isError?: boolean } }} */ (
    rpc
  );
  if (obj.error) {
    return {
      ok: false,
      error: obj.error.message ?? JSON.stringify(obj.error),
      rpc,
    };
  }
  const result = obj.result;
  if (!result) {
    return { ok: false, error: "missing result", rpc };
  }
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((c) =>
      c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : ""
    )
    .join("\n");
  if (result.isError) {
    return { ok: false, error: text || "tool returned isError", text, result };
  }
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { ok: true, text, parsed, result };
}

/**
 * @param {McpFetchConfig} config
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
export async function callMcpTool(config, name, args = {}) {
  const url = String(config.url || "").replace(/\/$/, "");
  if (!url) {
    return {
      ok: false,
      deferred: true,
      tool: name,
      reason: "CLAWQL_MCP_URL unset — search/execute stay on MCP host",
    };
  }

  /** @type {Record<string, string>} */
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": "2026-07-28",
  };
  if (config.bearer) {
    headers.authorization = `Bearer ${config.bearer}`;
  }

  const body = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: { name, arguments: args },
  };

  const timeoutMs = config.timeoutMs ?? 15_000;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return {
      ok: false,
      tool: name,
      error: err instanceof Error ? err.message : String(err),
      transport: "streamable-http",
      url,
    };
  }

  const rawText = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      tool: name,
      error: `HTTP ${res.status}: ${rawText.slice(0, 500)}`,
      transport: "streamable-http",
      url,
      status: res.status,
    };
  }

  let rpc;
  try {
    rpc = parseMcpHttpBody(rawText, res.headers.get("content-type") ?? "");
  } catch (err) {
    return {
      ok: false,
      tool: name,
      error: err instanceof Error ? err.message : String(err),
      raw: rawText.slice(0, 500),
    };
  }

  const unwrapped = unwrapToolsCallResult(rpc);
  return {
    ...unwrapped,
    tool: name,
    transport: "streamable-http",
    url,
    protocolVersion: "2026-07-28",
  };
}
