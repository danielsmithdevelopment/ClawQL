/**
 * Core `execute` implementation (OpenAPI / GraphQL / gRPC / REST paths).
 * REST and in-process GraphQL are in-package; native GraphQL/gRPC remain injected via `ExecuteEnvironment`.
 */

import { executeOperationGraphQL } from "../graphql/in-process-execute.js";
import { resolveApiBaseUrlForOperation, type OpenAPIDoc } from "../spec/spec-loader.js";
import type { Operation } from "../spec/operation-types.js";
import { defaultFields, executeOutputFields, projectRestByFields } from "./field-projection.js";
import { executeRestOperation } from "./rest-operation.js";
import type { ExecuteClawqlOperationParams, ExecuteEnvironment, McpTextContent } from "./types.js";

function textContent(text: string): McpTextContent[] {
  return [{ type: "text", text }];
}

/** Shared execute body — returns MCP text content blocks. */
export async function executeClawqlOperationWithEnv(
  env: ExecuteEnvironment,
  params: ExecuteClawqlOperationParams
): Promise<McpTextContent[]> {
  const { operationId, args, fields } = params;
  const loaded = await env.loadSpec();
  const { operations, openapi, openapis, multi } = loaded;
  const op = operations.find((o) => o.id === operationId);

  if (!op) {
    return textContent(
      JSON.stringify({
        error: `Unknown operationId: "${operationId}". Use search() to find valid operation IDs.`,
      })
    );
  }

  const openapiForOp = (
    multi && openapis?.length ? openapis[op.specIndex ?? 0] : openapi
  ) as OpenAPIDoc;
  const outputFields = executeOutputFields(operationId, fields);

  if (op.protocolKind === "graphql" && op.nativeGraphQL) {
    const selectedFields = outputFields?.length ? outputFields.join("\n        ") : "__typename";
    const exec = await env.executeNativeGraphQL(op, args, selectedFields);
    if (!exec.ok) {
      return textContent(
        JSON.stringify({
          error: exec.error,
          specLabel: op.specLabel ?? null,
          hint: "Native GraphQL execute failed (check endpoint, auth, and arguments).",
        })
      );
    }
    const root = exec.data as Record<string, unknown> | null | undefined;
    const inner =
      root && typeof root === "object" && op.nativeGraphQL.fieldName in root
        ? root[op.nativeGraphQL.fieldName]
        : exec.data;
    return textContent(JSON.stringify(projectRestByFields(inner, outputFields), null, 2));
  }

  if (op.protocolKind === "grpc" && op.nativeGrpc) {
    const exec = await env.executeNativeGrpc(op, args);
    if (!exec.ok) {
      return textContent(
        JSON.stringify({
          error: exec.error,
          specLabel: op.specLabel ?? null,
          hint: "Native gRPC execute failed (check endpoint, TLS/insecure, proto, and arguments).",
        })
      );
    }
    return textContent(JSON.stringify(projectRestByFields(exec.data, outputFields), null, 2));
  }

  if (multi) {
    const fallback = await executeRestOperation(op as Operation, args, openapiForOp);
    if (!fallback.ok) {
      return textContent(
        JSON.stringify({
          error: fallback.error,
          specLabel: op.specLabel ?? null,
          hint: "Multi-spec OpenAPI operations use REST only. Native GraphQL/gRPC ops use protocol execute.",
        })
      );
    }
    return textContent(JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2));
  }

  if (op.requestBody && op.requestBodyContentType?.toLowerCase() === "application/octet-stream") {
    const rest = await executeRestOperation(op as Operation, args, openapiForOp);
    if (!rest.ok) {
      return textContent(
        JSON.stringify({
          error: rest.error,
          specLabel: op.specLabel ?? null,
          hint: "application/octet-stream execute uses REST only; GraphQL projection is skipped.",
        })
      );
    }
    return textContent(JSON.stringify(projectRestByFields(rest.data, outputFields), null, 2));
  }

  try {
    const selectedFields = outputFields?.length
      ? outputFields.join("\n        ")
      : defaultFields(operationId);

    const baseUrl = resolveApiBaseUrlForOperation(openapiForOp, op as Operation);
    const inProc = await executeOperationGraphQL(
      openapiForOp,
      baseUrl,
      op as Operation,
      args,
      selectedFields
    );
    if (!inProc.ok) {
      throw new Error(inProc.error);
    }
    return textContent(JSON.stringify(projectRestByFields(inProc.data, outputFields), null, 2));
  } catch (err: unknown) {
    const fallback = await executeRestOperation(op as Operation, args, openapiForOp);
    if (!fallback.ok) {
      const reason = err instanceof Error ? err.message : String(err);
      return textContent(
        JSON.stringify({
          error: reason,
          fallbackError: fallback.error,
          hint: "GraphQL execution failed and REST fallback also failed.",
        })
      );
    }
    return textContent(JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2));
  }
}
