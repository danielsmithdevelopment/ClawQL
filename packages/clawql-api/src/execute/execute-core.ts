/**
 * Core `execute` implementation (OpenAPI / GraphQL / gRPC / REST paths).
 * All protocol paths run in-package; optional `loadSpecFn` supports tests and MCP overrides.
 */

import { Effect } from "effect";
import { executeOperationGraphQL } from "../graphql/in-process-execute.js";
import { loadSpec, resolveApiBaseUrlForOperation, type OpenAPIDoc } from "../spec/spec-loader.js";
import type { Operation } from "../spec/operation-types.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { gatewayRedactionEnabled, maybeGatewayRedactText } from "../redaction/gateway-redact.js";
import { defaultFields, executeOutputFields, projectRestByFields } from "./field-projection.js";
import { executeNativeGraphQL } from "./native-graphql.js";
import { executeNativeGrpc } from "./native-grpc.js";
import { executeNativeMcp } from "./native-mcp.js";
import { executeNativeCli } from "./native-cli.js";
import { executeRestOperation } from "./rest-operation.js";
import type { ExecuteClawqlOperationParams, McpTextContent } from "./types.js";

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function textContentEffect(text: string): Effect.Effect<McpTextContent[], Error> {
  return Effect.gen(function* () {
    const body = gatewayRedactionEnabled()
      ? yield* fromPromise(() => maybeGatewayRedactText(text))
      : text;
    return [{ type: "text" as const, text: body }];
  });
}

/** Shared execute body as an Effect program — returns MCP text content blocks. */
export function executeClawqlOperationEffect(
  params: ExecuteClawqlOperationParams,
  loadSpecFn: LoadSpecFn = loadSpec
): Effect.Effect<McpTextContent[], Error> {
  return Effect.gen(function* () {
    const { operationId, args, fields } = params;
    const loaded = yield* fromPromise(() => loadSpecFn());
    const { operations, openapi, openapis, multi } = loaded;
    const op = operations.find((o) => o.id === operationId);

    if (!op) {
      return yield* textContentEffect(
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
      const exec = yield* fromPromise(() =>
        executeNativeGraphQL(op as Operation, args, selectedFields)
      );
      if (!exec.ok) {
        return yield* textContentEffect(
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
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(inner, outputFields), null, 2)
      );
    }

    if (op.protocolKind === "grpc" && op.nativeGrpc) {
      const exec = yield* fromPromise(() => executeNativeGrpc(op as Operation, args));
      if (!exec.ok) {
        return yield* textContentEffect(
          JSON.stringify({
            error: exec.error,
            specLabel: op.specLabel ?? null,
            hint: "Native gRPC execute failed (check endpoint, TLS/insecure, proto, and arguments).",
          })
        );
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(exec.data, outputFields), null, 2)
      );
    }

    if (op.protocolKind === "mcp" && op.nativeMcp) {
      const exec = yield* fromPromise(() => executeNativeMcp(op as Operation, args));
      if (!exec.ok) {
        return yield* textContentEffect(
          JSON.stringify({
            error: exec.error,
            specLabel: op.specLabel ?? null,
            hint: "MCP proxy execute failed (check remote server and tool arguments).",
          })
        );
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(exec.data, outputFields), null, 2)
      );
    }

    if (op.protocolKind === "cli" && op.nativeCli) {
      const exec = yield* fromPromise(() => executeNativeCli(op as Operation, args));
      if (!exec.ok) {
        return yield* textContentEffect(
          JSON.stringify({
            error: exec.error,
            specLabel: op.specLabel ?? null,
            hint: "CLI source execute failed (check command, args, and env).",
          })
        );
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(exec.data, outputFields), null, 2)
      );
    }

    if (multi) {
      const fallback = yield* fromPromise(() =>
        executeRestOperation(op as Operation, args, openapiForOp)
      );
      if (!fallback.ok) {
        return yield* textContentEffect(
          JSON.stringify({
            error: fallback.error,
            specLabel: op.specLabel ?? null,
            hint: "Multi-spec OpenAPI operations use REST only. Native GraphQL/gRPC ops use protocol execute.",
          })
        );
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2)
      );
    }

    if (op.requestBody && op.requestBodyContentType?.toLowerCase() === "application/octet-stream") {
      const rest = yield* fromPromise(() =>
        executeRestOperation(op as Operation, args, openapiForOp)
      );
      if (!rest.ok) {
        return yield* textContentEffect(
          JSON.stringify({
            error: rest.error,
            specLabel: op.specLabel ?? null,
            hint: "application/octet-stream execute uses REST only; GraphQL projection is skipped.",
          })
        );
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(rest.data, outputFields), null, 2)
      );
    }

    const selectedFields = outputFields?.length
      ? outputFields.join("\n        ")
      : defaultFields(operationId);
    const baseUrl = resolveApiBaseUrlForOperation(openapiForOp, op as Operation);

    return yield* Effect.gen(function* () {
      const inProc = yield* fromPromise(() =>
        executeOperationGraphQL(openapiForOp, baseUrl, op as Operation, args, selectedFields)
      );
      if (!inProc.ok) {
        return yield* Effect.fail(new Error(inProc.error));
      }
      return yield* textContentEffect(
        JSON.stringify(projectRestByFields(inProc.data, outputFields), null, 2)
      );
    }).pipe(
      Effect.catchAll((err) =>
        Effect.gen(function* () {
          const fallback = yield* fromPromise(() =>
            executeRestOperation(op as Operation, args, openapiForOp)
          );
          if (!fallback.ok) {
            const reason = err instanceof Error ? err.message : String(err);
            return yield* textContentEffect(
              JSON.stringify({
                error: reason,
                fallbackError: fallback.error,
                hint: "GraphQL execution failed and REST fallback also failed.",
              })
            );
          }
          return yield* textContentEffect(
            JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2)
          );
        })
      )
    );
  }).pipe(
    Effect.withSpan("clawql.execute", {
      attributes: { "clawql.operationId": params.operationId },
    })
  );
}

/** Promise boundary for MCP handlers and legacy callers. */
export async function executeClawqlOperation(
  params: ExecuteClawqlOperationParams,
  loadSpecFn: LoadSpecFn = loadSpec
): Promise<McpTextContent[]> {
  return Effect.runPromise(executeClawqlOperationEffect(params, loadSpecFn));
}
