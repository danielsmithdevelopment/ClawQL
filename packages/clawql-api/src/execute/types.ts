export type McpTextContent = { type: "text"; text: string };

export type ExecuteClawqlOperationParams = {
  operationId: string;
  args: Record<string, unknown>;
  fields?: readonly string[];
  /**
   * Optional JMESPath applied server-side after the provider response and before
   * `fields` projection. See {@link ./where-filter.js}.
   */
  where?: string;
  /**
   * After `clawql resume` / MCP `resume` approves a parked mandate call, pass the
   * pending `executionId` so execute may run that exact payload once.
   */
  approvedExecutionId?: string;
};

export type ExecuteOperationResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Minimal operation shape for the execute pipeline (mirrors `src/operation-types.ts`). */
export type ExecuteOperation = {
  id: string;
  specIndex?: number;
  specLabel?: string;
  protocolKind?: "openapi" | "graphql" | "grpc" | "mcp" | "cli";
  requestBody?: string;
  requestBodyContentType?: string;
  nativeGraphQL?: {
    sourceLabel: string;
    operationType: "query" | "mutation";
    fieldName: string;
  };
  nativeGrpc?: {
    sourceLabel: string;
    clientKey: string;
    rpcName: string;
  };
  nativeMcp?: {
    sourceId: string;
    toolName: string;
  };
  nativeCli?: {
    sourceId: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  };
};
