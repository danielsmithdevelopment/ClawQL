export type McpTextContent = { type: "text"; text: string };

export type ExecuteClawqlOperationParams = {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
};

export type ExecuteOperationResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Minimal operation shape for the execute pipeline (mirrors `src/operation-types.ts`). */
export type ExecuteOperation = {
  id: string;
  specIndex?: number;
  specLabel?: string;
  protocolKind?: "openapi" | "graphql" | "grpc";
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
};

export type LoadedSpecForExecute = {
  operations: ExecuteOperation[];
  openapi: unknown;
  openapis?: unknown[];
  multi: boolean;
};

/** IO boundary injected by clawql-mcp until native GraphQL/gRPC executors move (#308). */
export type ExecuteEnvironment = {
  loadSpec: () => Promise<LoadedSpecForExecute>;
  executeNativeGraphQL: (
    op: ExecuteOperation,
    args: Record<string, unknown>,
    selectedFields: string
  ) => Promise<ExecuteOperationResult>;
  executeNativeGrpc: (
    op: ExecuteOperation,
    args: Record<string, unknown>
  ) => Promise<ExecuteOperationResult>;
};
