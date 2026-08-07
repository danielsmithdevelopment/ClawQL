/**
 * WebSocket tool-call surface (sixth API) for mcp-api-adapter.
 *
 * Message (client → server), either shape:
 *   { "id": "1", "tool": "memory_ingest", "arguments": { … } }
 *   { "id": "1", "method": "tools/call", "params": { "name": "…", "arguments": { … } } }
 *
 * Reply:
 *   { "id": "1", "ok": true, "result": … }
 *   { "id": "1", "ok": false, "error": "…" }
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { httpBodyFromCollapsed } from "./call.js";
import type { CallToolFn, ToolCatalog } from "./types.js";

export const DEFAULT_WS_PATH = "/ws";

export type ParsedWsToolCall = {
  id: string | number | null;
  toolName: string;
  args: Record<string, unknown>;
};

export function parseWsToolCall(raw: unknown): ParsedWsToolCall | { error: string } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "message must be a JSON object" };
  }
  const msg = raw as Record<string, unknown>;
  const id =
    typeof msg.id === "string" || typeof msg.id === "number" ? msg.id : null;

  let toolName = "";
  let args: Record<string, unknown> = {};

  if (typeof msg.method === "string" && msg.method.replace(/^\/+/, "") === "tools/call") {
    const params =
      msg.params && typeof msg.params === "object" && !Array.isArray(msg.params)
        ? (msg.params as Record<string, unknown>)
        : {};
    toolName = String(params.name ?? msg.tool ?? msg.name ?? "").trim();
    const a = params.arguments ?? params.args;
    if (a && typeof a === "object" && !Array.isArray(a)) {
      args = a as Record<string, unknown>;
    }
  } else {
    toolName = String(msg.tool ?? msg.name ?? "").trim();
    const a = msg.arguments ?? msg.args ?? msg.params;
    if (a && typeof a === "object" && !Array.isArray(a)) {
      args = a as Record<string, unknown>;
    }
  }

  if (!toolName) {
    return { error: "missing tool name (tool | name | params.name)" };
  }
  return { id, toolName, args };
}

function readWsApiKey(req: IncomingMessage): string | undefined {
  try {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const q =
      url.searchParams.get("apiKey")?.trim() ||
      url.searchParams.get("api_key")?.trim();
    if (q) return q;
  } catch {
    /* ignore */
  }
  const headerKey = req.headers["x-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) return headerKey.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

export type AttachWebSocketSurfaceOptions = {
  server: HttpServer;
  /** Path for WebSocket upgrade (default `/ws`). */
  path?: string;
  getCatalog: () => ToolCatalog;
  callTool: CallToolFn;
  apiKey?: string;
};

export type AttachedWebSocketSurface = {
  path: string;
  close: () => Promise<void>;
};

export function attachWebSocketSurface(
  options: AttachWebSocketSurfaceOptions
): AttachedWebSocketSurface {
  const path = (() => {
    const raw = (options.path ?? DEFAULT_WS_PATH).trim() || DEFAULT_WS_PATH;
    return raw.startsWith("/") ? raw.replace(/\/$/, "") || DEFAULT_WS_PATH : `/${raw}`;
  })();

  const apiKey = options.apiKey?.trim();
  const wss = new WebSocketServer({ server: options.server, path });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    if (apiKey) {
      const provided = readWsApiKey(req);
      if (provided !== apiKey) {
        socket.close(4401, "unauthorized");
        return;
      }
    }

    socket.send(
      JSON.stringify({
        type: "ready",
        path,
        surfaces: options.getCatalog().surfaces,
        toolCount: options.getCatalog().tools.length,
      })
    );

    socket.on("message", (data: RawData) => {
      void (async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(data));
        } catch {
          socket.send(JSON.stringify({ ok: false, error: "invalid JSON" }));
          return;
        }

        // Allow ping without a tool call
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as { type?: string }).type === "ping"
        ) {
          socket.send(JSON.stringify({ type: "pong", id: (parsed as { id?: unknown }).id ?? null }));
          return;
        }

        const call = parseWsToolCall(parsed);
        if ("error" in call) {
          socket.send(JSON.stringify({ id: null, ok: false, error: call.error }));
          return;
        }

        const tool = options.getCatalog().tools.find((t) => t.name === call.toolName);
        if (!tool) {
          socket.send(
            JSON.stringify({
              id: call.id,
              ok: false,
              error: `unknown tool: ${call.toolName}`,
            })
          );
          return;
        }

        try {
          const result = await options.callTool(tool, call.args);
          socket.send(
            JSON.stringify({
              id: call.id,
              ok: true,
              tool: call.toolName,
              result: httpBodyFromCollapsed(result),
            })
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const withResult = err as Error & { result?: unknown };
          socket.send(
            JSON.stringify({
              id: call.id,
              ok: false,
              tool: call.toolName,
              error: message,
              result: withResult.result,
            })
          );
        }
      })();
    });
  });

  return {
    path,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        wss.close((err: Error | undefined) => (err ? reject(err) : resolve()));
      });
    },
  };
}
