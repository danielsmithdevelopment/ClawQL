import express, { type Express, type Request } from "express";
import { httpBodyFromCollapsed } from "./call.js";
import {
  FormValidationError,
  fieldErrorFromMessage,
  parseFormArgs,
} from "./mcp-ui-form.js";
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
};

function asFormBody(req: Request): Record<string, unknown> {
  const body = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function attachMcpUiRoutes(app: Express, options: AttachMcpUiOptions): string {
  const basePath =
    (options.path?.trim() || DEFAULT_MCP_UI_PATH).replace(/\/$/, "") || DEFAULT_MCP_UI_PATH;
  const router = express.Router();

  router.use(express.urlencoded({ extended: false, limit: "2mb" }));

  router.get("/", (_req, res) => {
    const catalog = options.getCatalog();
    res.type("html").send(
      renderMcpUiCatalogPage({
        title: options.title ?? "MCP API Adapter",
        tools: catalog.tools,
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
    const tool = catalog.tools.find((t) => t.name === toolName);
    if (!tool) {
      res
        .status(404)
        .type("html")
        .send(renderMcpUiErrorResult({ toolName, message: "Unknown tool" }));
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
