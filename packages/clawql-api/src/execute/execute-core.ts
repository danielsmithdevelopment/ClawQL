/**
 * Core `execute` implementation (OpenAPI / GraphQL / gRPC / REST paths).
 * All protocol paths run in-package; optional `loadSpecFn` supports tests and MCP overrides.
 */

import { Effect } from "effect";
import { ArgsHash, ExecutionId, name, type Named } from "clawql-gdp";
import { executeOperationGraphQL } from "../graphql/in-process-execute.js";
import { loadSpec, resolveApiBaseUrlForOperation, type OpenAPIDoc } from "../spec/spec-loader.js";
import type { Operation } from "../spec/operation-types.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { gatewayRedactionEnabled, maybeGatewayRedactText } from "../redaction/gateway-redact.js";
import { hashPendingArgsEffect } from "../pending/args-hash.js";
import {
  markPendingCompleted,
  parkMandateExecute,
  tryConsumeApprovedMandate,
} from "../pending/pending-execution-service.js";
import { mandateArgsMatchEffect, type MandateArgsMatch } from "../proofs/mandate-args-match.js";
import { defaultFields, executeOutputFields } from "./field-projection.js";
import { serializeExecuteResultEffect } from "./result-truncation.js";
import { unknownOperationIdErrorEffect } from "./suggest-operation-ids.js";
import { shapeExecuteDataEffect, WhereFilterError } from "./where-filter.js";
import { executeNativeGraphQL } from "./native-graphql.js";
import { executeNativeGrpc } from "./native-grpc.js";
import { executeNativeMcp } from "./native-mcp.js";
import { executeNativeCli } from "./native-cli.js";
import { executeNativeWebmcp } from "./native-webmcp.js";
import { operationRiskEnforceEnabledEffect } from "../risk/operation-risk-enforce.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
} from "../ifc/session-ifc-enforce.js";
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

/**
 * Apply `where` then `fields` projection, then bound the serialized payload.
 * Fail-closed where errors become MCP error JSON (never return unfiltered provider data).
 * Oversized success bodies get an explicit `truncated: true` envelope (never a silent cut).
 */
function shapedSuccessContent(
  data: unknown,
  outputFields: string[] | undefined,
  where: string | undefined
): Effect.Effect<McpTextContent[], Error> {
  return shapeExecuteDataEffect(data, { where, fields: outputFields }).pipe(
    Effect.flatMap((shaped) =>
      serializeExecuteResultEffect(shaped).pipe(Effect.flatMap((text) => textContentEffect(text)))
    ),
    Effect.catch((err: unknown) => {
      if (err instanceof WhereFilterError) {
        return textContentEffect(
          JSON.stringify({
            ok: false,
            status: "where_invalid",
            error: err.message,
            issue: err.issue,
            fix: err.fixHint,
          })
        );
      }
      return Effect.fail(err instanceof Error ? err : new Error(String(err)));
    })
  );
}

function interpretExecuteOutcome(content: McpTextContent[]): {
  readonly ok: boolean;
  readonly error?: string;
} {
  const text = content[0]?.text ?? "";
  try {
    const parsed = JSON.parse(text) as { ok?: boolean; status?: string; error?: string };
    if (
      parsed.ok === false ||
      parsed.status === "blocked" ||
      parsed.status === "mandate_required"
    ) {
      return { ok: false, error: parsed.error ?? parsed.status ?? "execute refused" };
    }
    if (typeof parsed.error === "string" && parsed.error.length > 0 && parsed.ok !== true) {
      if (!("results" in parsed) && !Array.isArray(parsed)) {
        return { ok: false, error: parsed.error };
      }
    }
  } catch {
    /* non-JSON success bodies still count as completed */
  }
  return { ok: true };
}

/** Demand-only gate after local hash verification (gdp-ts). */
function acknowledgeMandateArgsMatchEffect<E, H>(
  _execution: Named<E, ReturnType<typeof ExecutionId>>,
  _expectedHash: Named<H, ReturnType<typeof ArgsHash>>,
  _proof: MandateArgsMatch<E, H>
): Effect.Effect<void> {
  return Effect.void;
}

/** Shared execute body as an Effect program — returns MCP text content blocks. */
export function executeClawqlOperationEffect(
  params: ExecuteClawqlOperationParams,
  loadSpecFn: LoadSpecFn = loadSpec
): Effect.Effect<McpTextContent[], Error> {
  return Effect.gen(function* () {
    const { operationId, args, fields, where } = params;
    const loaded = yield* fromPromise(() => loadSpecFn());
    const { operations, openapi, openapis, multi } = loaded;
    const op = operations.find((o) => o.id === operationId);

    if (!op) {
      const body = yield* unknownOperationIdErrorEffect(
        operationId,
        operations.map((o) => o.id)
      );
      return yield* textContentEffect(JSON.stringify(body));
    }

    const risk = op.risk;
    const enforceRisk = yield* operationRiskEnforceEnabledEffect();
    if (enforceRisk && risk?.policy === "block") {
      return yield* textContentEffect(
        JSON.stringify({
          ok: false,
          status: "blocked",
          reason: "Destructive operation is blocked unless allowlisted via operation-risk override",
          operationId,
          risk,
        })
      );
    }

    // Session IFC (ADR 0015): within-session-only — labels do not cross session keys.
    // Gated by CLAWQL_ENABLE_SESSION_IFC=1 (default off).
    const ifcBlock = checkSessionIfcWriteSync({
      operation: op as Operation,
      sessionId: params.sessionId,
    });
    if (ifcBlock) {
      return yield* textContentEffect(JSON.stringify(ifcBlock));
    }
    let consumedMandateId: string | undefined;

    if (enforceRisk && risk?.policy === "mandate") {
      const approvedId = params.approvedExecutionId?.trim();
      if (approvedId) {
        const livePayload = { operationId, args, fields, where };
        const argsHash = yield* hashPendingArgsEffect(livePayload);
        // Atomic consume before any side effect (CAS: approved + digest + not expired).
        const consumed = yield* fromPromise(() =>
          tryConsumeApprovedMandate({
            executionId: approvedId,
            argsHash,
          })
        );
        if (!consumed) {
          return yield* textContentEffect(
            JSON.stringify({
              ok: false,
              status: "mandate_required",
              reason: `No consumable approved mandate for ${approvedId} (already used, digest mismatch, or expired)`,
              operationId,
              risk,
              executionId: approvedId,
            })
          );
        }
        if (consumed.operationId !== operationId) {
          yield* fromPromise(() =>
            markPendingCompleted(approvedId, {
              ok: false,
              error: "approved executionId is bound to a different operationId",
            })
          );
          return yield* textContentEffect(
            JSON.stringify({
              ok: false,
              status: "blocked",
              reason: "approved executionId is bound to a different operationId",
              operationId,
              risk,
            })
          );
        }
        const mandateOk = yield* name(
          ExecutionId(approvedId),
          ArgsHash(consumed.argsHash),
          (execution, expectedHash) =>
            Effect.gen(function* () {
              const proof = yield* mandateArgsMatchEffect(execution, expectedHash, livePayload);
              if (!proof) return false;
              yield* acknowledgeMandateArgsMatchEffect(execution, expectedHash, proof);
              return true;
            })
        );
        if (!mandateOk) {
          yield* fromPromise(() =>
            markPendingCompleted(approvedId, {
              ok: false,
              error: "MandateArgsMatch proof failed",
            })
          );
          return yield* textContentEffect(
            JSON.stringify({
              ok: false,
              status: "blocked",
              reason: "MandateArgsMatch proof failed",
              operationId,
              risk,
              executionId: approvedId,
            })
          );
        }
        consumedMandateId = approvedId;
      } else {
        const parked = yield* fromPromise(() =>
          parkMandateExecute({
            operationId,
            args,
            fields,
            where,
            risk,
            idempotencyCapable: op.riskHints?.idempotencyCapable === true,
          })
        );
        return yield* textContentEffect(JSON.stringify(parked));
      }
    }

    const runSideEffect = Effect.gen(function* () {
      const openapiForOp = (
        multi && openapis?.length ? openapis[op.specIndex ?? 0] : openapi
      ) as OpenAPIDoc;
      const outputFields = executeOutputFields(operationId, fields);

      if (op.protocolKind === "graphql" && op.nativeGraphQL) {
        const selectedFields = outputFields?.length
          ? outputFields.join("\n        ")
          : "__typename";
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
        return yield* shapedSuccessContent(inner, outputFields, where);
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
        return yield* shapedSuccessContent(exec.data, outputFields, where);
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
        return yield* shapedSuccessContent(exec.data, outputFields, where);
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
        return yield* shapedSuccessContent(exec.data, outputFields, where);
      }

      if (op.protocolKind === "webmcp" && op.nativeWebmcp) {
        const exec = yield* fromPromise(() => executeNativeWebmcp(op as Operation, args));
        if (!exec.ok) {
          return yield* textContentEffect(
            JSON.stringify({
              error: exec.error,
              specLabel: op.specLabel ?? null,
              hint: "WebMCP execute failed (check CDP browser, page URL, and tool arguments).",
            })
          );
        }
        return yield* shapedSuccessContent(exec.data, outputFields, where);
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
        return yield* shapedSuccessContent(fallback.data, outputFields, where);
      }

      if (
        op.requestBody &&
        op.requestBodyContentType?.toLowerCase() === "application/octet-stream"
      ) {
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
        return yield* shapedSuccessContent(rest.data, outputFields, where);
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
        return yield* shapedSuccessContent(inProc.data, outputFields, where);
      }).pipe(
        Effect.catch((err) =>
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
            return yield* shapedSuccessContent(fallback.data, outputFields, where);
          })
        )
      );
    });

    const content = yield* runSideEffect.pipe(
      Effect.catch((err) => {
        if (!consumedMandateId) return Effect.fail(err);
        const message = err instanceof Error ? err.message : String(err);
        return fromPromise(() =>
          markPendingCompleted(consumedMandateId!, { ok: false, error: message })
        ).pipe(Effect.andThen(Effect.fail(err)));
      })
    );

    if (consumedMandateId) {
      const outcome = interpretExecuteOutcome(content);
      yield* fromPromise(() => markPendingCompleted(consumedMandateId!, outcome));
    }

    // Accumulate read labels only after a successful execute (ADR 0015 session IFC).
    {
      const outcome = interpretExecuteOutcome(content);
      accumulateSessionIfcReadSync({
        operation: op as Operation,
        sessionId: params.sessionId,
        success: outcome.ok,
      });
    }

    return content;
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
