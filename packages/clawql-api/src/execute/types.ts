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
