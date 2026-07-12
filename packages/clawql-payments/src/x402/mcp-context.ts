import { AsyncLocalStorage } from "node:async_hooks";

export type McpX402RequestContext = {
  headers: Record<string, string | string[] | undefined>;
  requestUrl?: string;
  correlationId?: string;
};

const mcpX402Storage = new AsyncLocalStorage<McpX402RequestContext>();

export function runWithMcpX402Context<T>(
  context: McpX402RequestContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return Promise.resolve(mcpX402Storage.run(context, fn));
}

export function getMcpX402Context(): McpX402RequestContext | undefined {
  return mcpX402Storage.getStore();
}

export function headersFromExpressRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  protocol?: string;
  get?: (name: string) => string | undefined;
  originalUrl?: string;
}): McpX402RequestContext {
  const host = req.get?.("host") ?? "localhost";
  const protocol = req.protocol ?? "http";
  const path = req.originalUrl ?? "/mcp";
  return {
    headers: req.headers,
    requestUrl: `${protocol}://${host}${path}`,
    correlationId:
      (typeof req.headers["x-correlation-id"] === "string"
        ? req.headers["x-correlation-id"]
        : undefined) ??
      (typeof req.headers["x-clawql-correlation-id"] === "string"
        ? req.headers["x-clawql-correlation-id"]
        : undefined),
  };
}

export function headersFromPlainRecord(
  headers: Record<string, string | string[] | undefined>,
  requestUrl?: string
): McpX402RequestContext {
  return {
    headers,
    requestUrl,
    correlationId:
      (typeof headers["x-correlation-id"] === "string" ? headers["x-correlation-id"] : undefined) ??
      (typeof headers["x-clawql-correlation-id"] === "string"
        ? headers["x-clawql-correlation-id"]
        : undefined),
  };
}
