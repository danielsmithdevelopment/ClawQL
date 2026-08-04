import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  structToJson,
  type ListedMcpTool,
} from "mcp-grpc-transport";

export type CollapsedToolResult = {
  structuredContent?: Record<string, unknown>;
  content?: unknown[];
  isError?: boolean;
  text?: string;
  /** Raw streamed CallTool response messages (debug). */
  messages?: Record<string, unknown>[];
};

function hasUsefulValues(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj).some((v) => v !== undefined);
}

/** Prefer structuredContent; else parse tool text as JSON; else envelope. */
export function httpBodyFromCollapsed(result: CollapsedToolResult): unknown {
  if (hasUsefulValues(result.structuredContent)) {
    return result.structuredContent;
  }
  if (result.text) {
    try {
      return JSON.parse(result.text) as unknown;
    } catch {
      /* keep envelope */
    }
  }
  const out: Record<string, unknown> = {};
  if (result.content) out.content = result.content;
  if (result.isError !== undefined) out.isError = result.isError;
  if (result.text) out.text = result.text;
  return out;
}

/**
 * Normalize an MCP SDK `CallToolResult` (stdio / Streamable HTTP) into the same
 * collapsed shape used for gRPC CallTool responses.
 */
export function collapseSdkToolResult(result: unknown): CollapsedToolResult {
  const r = (result ?? {}) as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const out: CollapsedToolResult = {};
  if (r.structuredContent && typeof r.structuredContent === "object") {
    out.structuredContent = r.structuredContent as Record<string, unknown>;
  }
  if (Array.isArray(r.content) && r.content.length > 0) {
    out.content = r.content;
    const texts = r.content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (texts.length > 0) out.text = texts[texts.length - 1];
  }
  if (typeof r.isError === "boolean") out.isError = r.isError;
  return out;
}

/** Collapse server-streaming CallTool responses into a single JSON-friendly result. */
export function collapseCallToolMessages(
  messages: Record<string, unknown>[]
): CollapsedToolResult {
  let structuredContent: Record<string, unknown> | undefined;
  let content: unknown[] | undefined;
  let isError: boolean | undefined;

  for (const msg of messages) {
    const rawSc = msg.structured_content ?? msg.structuredContent;
    const decoded =
      rawSc && typeof rawSc === "object"
        ? structToJson(rawSc as { fields?: Record<string, unknown> | Map<string, unknown> })
        : undefined;
    if (hasUsefulValues(decoded)) {
      structuredContent = decoded;
    }
    const c = msg.content;
    if (Array.isArray(c) && c.length > 0) {
      content = c;
    }
    if (typeof msg.is_error === "boolean") isError = msg.is_error;
    if (typeof msg.isError === "boolean") isError = msg.isError;
  }

  const text = lastNonEmptyCallToolText(messages);
  const out: CollapsedToolResult = {};
  if (hasUsefulValues(structuredContent)) out.structuredContent = structuredContent;
  if (content) out.content = content;
  if (isError !== undefined) out.isError = isError;
  if (text) out.text = text;
  return out;
}

export async function callToolViaGrpc(options: {
  grpcAddress: string;
  tool: ListedMcpTool;
  arguments: Record<string, unknown>;
  protocolVersion?: string;
}): Promise<CollapsedToolResult> {
  const messages = await callToolServerStreamingGrpc({
    address: options.grpcAddress,
    toolName: options.tool.name,
    arguments: options.arguments,
    protocolVersion: options.protocolVersion,
  });
  const collapsed = collapseCallToolMessages(messages);
  if (collapsed.isError) {
    const err = new Error(collapsed.text || `MCP tool ${options.tool.name} returned isError`);
    (err as Error & { result?: CollapsedToolResult }).result = collapsed;
    throw err;
  }
  return collapsed;
}
