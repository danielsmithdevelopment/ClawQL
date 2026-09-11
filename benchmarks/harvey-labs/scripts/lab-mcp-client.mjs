#!/usr/bin/env node
/** Reusable MCP Streamable HTTP client for Harvey LAB pre-ingest (initialize + tools/call). */
import { randomUUID } from "node:crypto";

const DEFAULT_URL = "http://localhost:8080/mcp";
const DEFAULT_PROTOCOL = "2025-11-25";

/**
 * Parse MCP HTTP response body (JSON or SSE `data:` lines).
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
 * Unwrap MCP tools/call content[] text blocks to parsed JSON when possible.
 * @param {unknown} result
 */
export function unwrapMcpToolPayload(result) {
  if (!result || typeof result !== "object") return result;
  const content = /** @type {{ content?: unknown[] }} */ (result).content;
  if (
    Array.isArray(content) &&
    content.length > 0 &&
    typeof content[0] === "object" &&
    content[0] !== null &&
    /** @type {{ type?: string; text?: string }} */ (content[0]).type === "text" &&
    typeof /** @type {{ text?: string }} */ (content[0]).text === "string"
  ) {
    const text = /** @type {{ text: string }} */ (content[0]).text;
    try {
      return JSON.parse(text);
    } catch {
      return result;
    }
  }
  return result;
}

/** Extract primary text from MCP tool result content blocks. */
export function mcpToolText(result) {
  if (result && typeof result === "object") {
    const content = /** @type {{ content?: unknown[] }} */ (result).content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (
        typeof first === "object" &&
        first !== null &&
        /** @type {{ type?: string; text?: string }} */ (first).type === "text"
      ) {
        return String(/** @type {{ text?: string }} */ (first).text ?? "");
      }
    }
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result, null, 2);
}

export class LabMcpClient {
  /**
   * @param {{ url?: string; protocolVersion?: string }} [options]
   */
  constructor(options = {}) {
    this.url = options.url ?? process.env.CLAWQL_MCP_URL ?? DEFAULT_URL;
    this.protocolVersion =
      options.protocolVersion ?? process.env.CLAWQL_MCP_PROTOCOL_VERSION ?? DEFAULT_PROTOCOL;
    /** @type {Record<string, string>} */
    this.sessionHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    this._rpcId = 0;
    this._sessionReady = false;
  }

  _nextId() {
    this._rpcId += 1;
    return `lab-${this._rpcId}-${randomUUID().slice(0, 8)}`;
  }

  async ensureSession() {
    if (this._sessionReady && this.sessionHeaders["mcp-protocol-version"]) {
      return;
    }
    this.sessionHeaders["mcp-protocol-version"] = this.protocolVersion;
    const payload = {
      jsonrpc: "2.0",
      id: this._nextId(),
      method: "initialize",
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: { name: "harvey-lab-pre-ingest", version: "0.2.0" },
      },
    };
    const resp = await fetch(this.url, {
      method: "POST",
      headers: this.sessionHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 1000)}`);
    }
    const sid = resp.headers.get("mcp-session-id") || resp.headers.get("Mcp-Session-Id");
    if (sid) this.sessionHeaders["mcp-session-id"] = sid;
    const body = parseMcpHttpBody(await resp.text(), resp.headers.get("content-type") ?? "");
    const negotiated =
      body && typeof body === "object" && body.result && typeof body.result === "object"
        ? body.result.protocolVersion
        : undefined;
    if (negotiated) {
      this.protocolVersion = negotiated;
      this.sessionHeaders["mcp-protocol-version"] = negotiated;
    }
    try {
      await fetch(this.url, {
        method: "POST",
        headers: this.sessionHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      // best-effort
    }
    this._sessionReady = true;
  }

  /**
   * @param {string} toolName
   * @param {Record<string, unknown>} args
   * @param {{ timeout?: number }} [opts]
   */
  async callTool(toolName, args, opts = {}) {
    await this.ensureSession();
    const timeout = opts.timeout ?? 180_000;
    const payload = {
      jsonrpc: "2.0",
      id: this._nextId(),
      method: "tools/call",
      params: { name: toolName, arguments: { ...args } },
    };
    const resp = await fetch(this.url, {
      method: "POST",
      headers: this.sessionHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    if (resp.status >= 400) {
      throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 1000)}`);
    }
    const data = parseMcpHttpBody(await resp.text(), resp.headers.get("content-type") ?? "");
    if (data && typeof data === "object" && data.error) {
      throw new Error(JSON.stringify(data.error));
    }
    const result = data && typeof data === "object" && "result" in data ? data.result : data;
    return result ?? { raw: data };
  }
}
