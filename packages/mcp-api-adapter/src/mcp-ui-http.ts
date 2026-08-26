import express, { type Express, type Request } from "express";
import { httpBodyFromCollapsed } from "./call.js";
import type { VerifiedMcpAdapterAtr } from "./edge-auth.js";
import {
  FormValidationError,
  fieldErrorFromMessage,
  parseFormArgs,
} from "./mcp-ui-form.js";
import { filterToolsForAtr } from "./mcp-ui-atr.js";
import {
  renderMcpUiCatalogPage,
  renderMcpUiErrorResult,
  renderMcpUiSuccessResult,
} from "./mcp-ui-html.js";
import { isSafeToolPathName } from "./schema-convert.js";
import type { CallToolFn, ToolCatalog } from "./types.js";

export const DEFAULT_MCP_UI_PATH = "/mcp-ui";

export type AttachMcpUiOptions = {
  getCatalog: () => ToolCatalog;
  callTool: CallToolFn;
  title?: string;
  path?: string;
  /** Filter catalog/execute by `req.mcpAtr` (default true). */
  atrScoped?: boolean;
};

type RequestWithAtr = Request & { mcpAtr?: VerifiedMcpAdapterAtr };

function asFormBody(req: Request): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function atrFromRequest(req: Request): VerifiedMcpAdapterAtr | undefined {
  return (req as RequestWithAtr).mcpAtr;
}

export function attachMcpUiRoutes(app: Express, options: AttachMcpUiOptions): string {
  const basePath =
    (options.path?.trim() || DEFAULT_MCP_UI_PATH).replace(/\/$/, "") || DEFAULT_MCP_UI_PATH;
  const atrScoped = options.atrScoped !== false;
  const router = express.Router();

  router.use(express.urlencoded({ extended: false, limit: "2mb" }));

  router.get("/", (req, res) => {
    const catalog = options.getCatalog();
    const atr = atrFromRequest(req);
    const tools = filterToolsForAtr(catalog.tools, atr, atrScoped);
    res.type("html").send(
      renderMcpUiCatalogPage({
        title: options.title ?? "MCP API Adapter",
        tools,
        fetchedAt: catalog.fetchedAt,
        upstream: catalog.upstream,
        basePath,
      })
    );
  });

  router.post("/execute/:toolName", async (req, res) => {
    const toolName = String(req.params.toolName ?? "");
    if (!isSafeToolPathName(toolName)) {
      res
        .status(400)
        .type("html")
        .send(renderMcpUiErrorResult({ toolName, message: "Invalid tool name" }));
      return;
    }

    const catalog = options.getCatalog();
    const atr = atrFromRequest(req);
    const authorized = filterToolsForAtr(catalog.tools, atr, atrScoped);
    const tool = authorized.find((t) => t.name === toolName);
    if (!tool) {
      const exists = catalog.tools.some((t) => t.name === toolName);
      res
        .status(exists ? 403 : 404)
        .type("html")
        .send(
          renderMcpUiErrorResult({
            toolName,
            message: exists
              ? "Forbidden — this tool is outside your ATR scope"
              : "Unknown tool",
          })
        );
      return;
    }

    let args: Record<string, unknown>;
    try {
      args = parseFormArgs(asFormBody(req), tool.inputSchema ?? { type: "object", properties: {} });
    } catch (err) {
      if (err instanceof FormValidationError) {
        res.status(400).type("html").send(
          renderMcpUiErrorResult({
            toolName,
            message: err.message,
            fieldErrors: err.fields,
          })
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res
        .status(400)
        .type("html")
        .send(renderMcpUiErrorResult({ toolName, message }));
      return;
    }

    const started = Date.now();
    try {
      const result = await options.callTool(tool, args);
      const body = httpBodyFromCollapsed(result);
      res.status(200).type("html").send(
        renderMcpUiSuccessResult({
          toolName,
          executionMs: Date.now() - started,
          body,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const withResult = err as Error & { result?: unknown };
      const details =
        withResult.result !== undefined
          ? JSON.stringify(withResult.result, null, 2)
          : undefined;
      const fieldErr = fieldErrorFromMessage(message);
      res.status(502).type("html").send(
        renderMcpUiErrorResult({
          toolName,
          message,
          details,
          fieldErrors: fieldErr.field ? [fieldErr] : undefined,
        })
      );
    }
  });

  app.use(basePath, router);
  return basePath;
}
