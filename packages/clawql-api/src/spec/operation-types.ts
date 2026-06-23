/**
 * Shared operation shape for Discovery-derived and native OpenAPI specs.
 */

/** Set on `Operation.requestBody` when the spec uses an inline JSON schema (no `components/schemas` ref). */
export const INLINE_OPENAPI_REQUEST_BODY = "__clawql_inline_request_body__";

/** Execution path for merged operations (defaults to OpenAPI-derived REST / in-process GraphQL-from-OAI). */
export type ProtocolKind = "openapi" | "graphql" | "grpc";

export interface Operation {
  id: string;
  method: string;
  path: string;
  flatPath: string;
  description: string;
  resource: string;
  parameters: Record<string, ParameterInfo>;
  scopes: string[];
  requestBody?: string;
  /** Selected OpenAPI requestBody media type (e.g. multipart/form-data); drives REST `execute` body encoding. */
  requestBodyContentType?: string;
  responseBody?: string;
  /**
   * When multiple specs are loaded, index into `LoadedSpec.openapis` for this operation.
   */
  specIndex?: number;
  /** Short label for search results, e.g. `compute-v1`. */
  specLabel?: string;
  /**
   * When set, `execute` uses this path instead of OpenAPI→GraphQL or REST.
   * Omitted or `openapi` keeps legacy behavior.
   */
  protocolKind?: ProtocolKind;
  /** Native GraphQL root field (HTTP introspection + HTTP execute). */
  nativeGraphQL?: {
    sourceLabel: string;
    operationType: "query" | "mutation";
    fieldName: string;
  };
  /** Native gRPC unary RPC from a loaded proto. */
  nativeGrpc?: {
    sourceLabel: string;
    /** Registry key for the shared `grpc.Client` (`${label}::${fqServiceName}`). */
    clientKey: string;
    /** Method name on the service client (camelCase RPC name). */
    rpcName: string;
  };
}

export interface ParameterInfo {
  type: string;
  location: "path" | "query";
  required: boolean;
  description: string;
}
