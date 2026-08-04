/**
 * Streamable HTTP MCP endpoint (`/mcp` by default) that delegates to the upstream
 * via a bridged McpServer — same pattern as Panguard.
 */

import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export type AttachMcpHttpOptions = {
  /** URL path (default `/mcp`). */
  path?: string;
  /** Factory for a new bridged MCP server (one per Streamable HTTP session). */
  createMcpServer: () => McpServer | Promise<McpServer>;
};

function jsonRpcError(res: Response, message: string, status = 400): void {
  if (res.headersSent) return;
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

/**
 * Mount Streamable HTTP MCP on `path`. Call **before** `POST /:toolName`
 * so `/mcp` is not captured as a tool name.
 */
export function attachMcpHttpRoutes(app: Express, options: AttachMcpHttpOptions): void {
  const mcpPath = (options.path?.trim() || "/mcp").replace(/\/$/, "") || "/mcp";
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post(mcpPath, async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid) transports.delete(sid);
        };
        const mcp = await options.createMcpServer();
        await mcp.connect(transport);
      } else {
        jsonRpcError(
          res,
          "Bad Request: missing/invalid mcp-session-id, or initialize request required."
        );
        return;
      }

      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error("[mcp-api-adapter] POST", mcpPath, "error:", err);
      if (!res.headersSent) {
        jsonRpcError(
          res,
          err instanceof Error ? err.message : "Bad gateway: MCP session failed",
          502
        );
      }
    }
  });

  app.get(mcpPath, async (req: Request, res: Response) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req: Request, res: Response) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });
}
