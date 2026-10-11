/**
 * Derive default operation risk from protocol / method / trusted MCP annotations.
 */

import { Effect } from "effect";
import type { Operation } from "../spec/operation-types.js";
import {
  levelForPolicy,
  type OperationRisk,
  type OperationRiskPolicy,
} from "./operation-risk-types.js";

export type ClassifyOperationRiskInput = {
  readonly operation: Operation;
  readonly trustedMcpSourceIds: ReadonlySet<string>;
};

function risk(
  policy: OperationRiskPolicy,
  source: OperationRisk["source"],
  reason: string
): OperationRisk {
  return { policy, level: levelForPolicy(policy), source, reason };
}

function classifyHttpMethod(method: string): OperationRisk | null {
  const m = method.trim().toUpperCase();
  if (m === "GET" || m === "HEAD") {
    return risk("allow", "spec-default", `HTTP ${m} is read-only by default`);
  }
  if (m === "POST" || m === "PUT" || m === "PATCH") {
    return risk(
      "mandate",
      "spec-default",
      `HTTP ${m} is a write by default (override if read-only)`
    );
  }
  if (m === "DELETE") {
    return risk("block", "spec-default", "HTTP DELETE is destructive unless allowlisted");
  }
  return null;
}

function classifyGraphql(method: string): OperationRisk | null {
  const m = method.trim().toUpperCase();
  if (m === "QUERY") {
    return risk("allow", "spec-default", "GraphQL query is read-only by default");
  }
  if (m === "MUTATION") {
    return risk("mandate", "spec-default", "GraphQL mutation requires a mandate by default");
  }
  return null;
}

function classifyMcp(op: Operation, trustedMcpSourceIds: ReadonlySet<string>): OperationRisk {
  const sourceId = op.riskHints?.mcpSourceId ?? op.nativeMcp?.sourceId ?? op.specLabel ?? "";
  const trusted = sourceId.length > 0 && trustedMcpSourceIds.has(sourceId);
  if (!trusted) {
    return risk(
      "mandate",
      "unknown-default",
      sourceId
        ? `MCP source "${sourceId}" is not trusted; annotations ignored → mandate`
        : "MCP source untrusted / unknown; annotations ignored → mandate"
    );
  }

  const destructive = op.riskHints?.mcpDestructiveHint === true;
  const readOnly = op.riskHints?.mcpReadOnlyHint === true;
  if (destructive) {
    return risk(
      "block",
      "mcp-annotation",
      `Trusted MCP source "${sourceId}" marked destructiveHint`
    );
  }
  if (readOnly) {
    return risk("allow", "mcp-annotation", `Trusted MCP source "${sourceId}" marked readOnlyHint`);
  }
  return risk(
    "mandate",
    "unknown-default",
    `Trusted MCP source "${sourceId}" has no read/destructive hint → mandate`
  );
}

function classifyGrpc(op: Operation): OperationRisk {
  if (op.riskHints?.grpcNoSideEffects === true) {
    return risk("allow", "spec-default", "gRPC method marked idempotency_level=NO_SIDE_EFFECTS");
  }
  return risk("mandate", "unknown-default", "gRPC method has no no-side-effects marker → mandate");
}

/** Pure classifier — Effect-wrapped for domain boundary consistency. */
export const classifyOperationRiskEffect = (
  input: ClassifyOperationRiskInput
): Effect.Effect<OperationRisk> =>
  Effect.sync(() => {
    const { operation: op, trustedMcpSourceIds } = input;
    const kind = op.protocolKind ?? "openapi";

    if (kind === "mcp" || op.method.toUpperCase() === "MCP") {
      return classifyMcp(op, trustedMcpSourceIds);
    }
    if (kind === "graphql" || op.nativeGraphQL) {
      return (
        classifyGraphql(op.method) ??
        risk("mandate", "unknown-default", "Unclassifiable GraphQL operation → mandate")
      );
    }
    if (kind === "grpc" || op.nativeGrpc) {
      return classifyGrpc(op);
    }
    if (kind === "cli" || kind === "webmcp") {
      return risk(
        "mandate",
        "unknown-default",
        `${kind} operations default to mandate (no safe read signal)`
      );
    }

    // OpenAPI / Discovery / REST
    return (
      classifyHttpMethod(op.method) ??
      risk("mandate", "unknown-default", `Unclassifiable HTTP method "${op.method}" → mandate`)
    );
  });

export function classifyOperationRisk(input: ClassifyOperationRiskInput): OperationRisk {
  return Effect.runSync(classifyOperationRiskEffect(input));
}
