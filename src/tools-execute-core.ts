/**
 * Core `execute` implementation (OpenAPI / GraphQL / gRPC / REST paths).
 * Wired into clawql-api via ExecuteLive in clawql-api-adapters.ts.
 */

import { loadSpec, resolveApiBaseUrlForOperation, type OpenAPIDoc } from "./spec-loader.js";
import { executeOperationGraphQL } from "./graphql-in-process-execute.js";
import { executeNativeGraphQL } from "./execute-native-graphql.js";
import { executeNativeGrpc } from "./execute-native-grpc.js";
import { executeRestOperation } from "./rest-operation.js";

export type ExecuteClawqlOperationParams = {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
};

export type McpTextContent = { type: "text"; text: string };

/**
 * REST execute paths (multi-spec or GraphQL→REST fallback) return the full HTTP JSON body.
 * When the caller passed `fields`, keep only those top-level keys so behavior aligns with
 * the GraphQL selection set (nested GraphQL fragments are not parsed—list top-level names).
 */
export function projectRestByFields(data: unknown, fields: string[] | undefined): unknown {
  if (!fields?.length) return data;
  const pick = (item: unknown): unknown => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
      }
      return out;
    }
    return item;
  };
  if (Array.isArray(data)) return data.map(pick);
  return pick(data);
}

function defaultExecuteOutputFields(operationId: string): string[] | undefined {
  switch (operationId) {
    case "pulls/create":
    case "pulls/update":
    case "pulls/get":
      return ["html_url", "number", "title", "state", "url"];
    case "chat_postMessage":
      return ["ok", "error", "channel", "ts", "message", "warning"];
    default:
      return undefined;
  }
}

/** Effective field list for GraphQL selection and post-response projection. */
export function executeOutputFields(
  operationId: string,
  fields: string[] | undefined
): string[] | undefined {
  if (fields && fields.length > 0) return fields;
  return defaultExecuteOutputFields(operationId);
}

/** Default field selection so the agent gets useful data without specifying fields. */
export function defaultFields(operationId: string): string {
  if (operationId.includes(".services.list"))
    return "services { name uri latestReadyRevision reconciling createTime }\nnextPageToken";
  if (operationId.includes(".jobs.list"))
    return "jobs { name reconciling createTime updateTime }\nnextPageToken";
  if (operationId.includes(".executions.list"))
    return "executions { name job succeededCount failedCount runningCount createTime }\nnextPageToken";
  if (operationId.includes(".revisions.list"))
    return "revisions { name service reconciling createTime }\nnextPageToken";
  if (operationId.includes(".operations.list"))
    return "operations { name done error { code message } }\nnextPageToken";
  if (operationId.includes(".tasks.list"))
    return "tasks { name job execution createTime }\nnextPageToken";
  if (operationId.includes(".services.get"))
    return "name uri latestReadyRevision latestCreatedRevision reconciling terminalCondition { type state message } createTime updateTime";
  if (operationId.includes(".jobs.get"))
    return "name reconciling terminalCondition { type state message } latestCreatedExecution { name createTime } createTime updateTime";
  if (operationId.includes(".operations.get") || operationId.includes(".operations.wait"))
    return "name done error { code message } metadata";
  if (operationId.includes(".executions.get"))
    return "name job succeededCount failedCount runningCount completionTime createTime";
  if (operationId.includes("IamPolicy")) return "version bindings { role members }";
  if (
    operationId.includes(".create") ||
    operationId.includes(".patch") ||
    operationId.includes(".delete") ||
    operationId.includes(".run") ||
    operationId.includes(".cancel")
  )
    return "name done error { code message }";
  return "name";
}

function textContent(text: string): McpTextContent[] {
  return [{ type: "text", text }];
}

/** Shared execute body — returns MCP text content blocks. */
export async function executeClawqlOperationCore(
  params: ExecuteClawqlOperationParams
): Promise<McpTextContent[]> {
  const { operationId, args, fields } = params;
  const loaded = await loadSpec();
  const { operations, openapi, openapis, multi } = loaded;
  const op = operations.find((o) => o.id === operationId);

  if (!op) {
    return textContent(
      JSON.stringify({
        error: `Unknown operationId: "${operationId}". Use search() to find valid operation IDs.`,
      })
    );
  }

  const openapiForOp = multi && openapis?.length ? openapis[op.specIndex ?? 0] : openapi;
  const outputFields = executeOutputFields(operationId, fields);

  if (op.protocolKind === "graphql" && op.nativeGraphQL) {
    const selectedFields = outputFields?.length ? outputFields.join("\n        ") : "__typename";
    const exec = await executeNativeGraphQL(op, args, selectedFields);
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
    const exec = await executeNativeGrpc(op, args);
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
    const fallback = await executeRestOperation(op, args, openapiForOp);
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
    const rest = await executeRestOperation(op, args, openapiForOp);
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

    const baseUrl = resolveApiBaseUrlForOperation(openapiForOp as OpenAPIDoc, op);
    const inProc = await executeOperationGraphQL(
      openapiForOp as OpenAPIDoc,
      baseUrl,
      op,
      args,
      selectedFields
    );
    if (!inProc.ok) {
      throw new Error(inProc.error);
    }
    return textContent(JSON.stringify(projectRestByFields(inProc.data, outputFields), null, 2));
  } catch (err: unknown) {
    const fallback = await executeRestOperation(op, args, openapiForOp);
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
