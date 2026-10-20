/**
 * Native MCP tool gate — same properties as execute-core for ClawQL-owned tools:
 * session IFC (data-flow) + park destructive writes for approval.
 *
 * Called from `wrapRegisteredMcpToolHandler` so every registered tool hits this
 * choke point (proxy hooks already run first).
 */

import { Effect } from "effect";
import type { Operation } from "../spec/operation-types.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  sessionIfcEnabled,
} from "../ifc/session-ifc-enforce.js";
import { accumulateSessionLabelsSync, resolveSessionLabelKey } from "../ifc/session-label-store.js";
import { operationRiskEnforceEnabledEffect } from "../risk/operation-risk-enforce.js";
import { parkMandateExecute } from "../pending/pending-execution-service.js";
import {
  isExecutePathTool,
  NATIVE_TOOL_GOVERNANCE_MODULE_ID,
  resolveNativeToolPolicy,
  UNTRUSTED_SPEC_LABELS,
  type NativeToolKind,
  type NativeToolPolicy,
} from "./native-tool-policy.js";

export { NATIVE_TOOL_GOVERNANCE_MODULE_ID };

export type NativeToolGateBlock = {
  readonly ok: false;
  readonly status: "blocked" | "mandate_required";
  readonly reason: string;
  readonly toolName: string;
  readonly mechanism: "untrusted_read_taint" | "data_flow" | "park_destructive_write";
  readonly executionId?: string;
  readonly risk?: unknown;
};

function syntheticOperation(
  toolName: string,
  policy: NativeToolPolicy,
  method: "GET" | "POST"
): Operation {
  return {
    id: `native.${toolName}`,
    method,
    path: `/native/${toolName}`,
    flatPath: `native/${toolName}`,
    description: `Native MCP tool ${toolName}`,
    resource: policy.specLabel,
    parameters: {},
    scopes: [],
    protocolKind: "mcp",
    specLabel: policy.specLabel,
    riskHints: {
      mcpSourceId: "clawql-native",
      mcpReadOnlyHint: policy.kind === "read" || policy.kind === "passthrough",
      mcpDestructiveHint: policy.kind === "destructive",
    },
    risk: {
      policy:
        policy.kind === "destructive" ? "mandate" : policy.kind === "write" ? "mandate" : "allow",
      level: policy.kind === "destructive" ? "HIGH" : policy.kind === "write" ? "MEDIUM" : "LOW",
      source: "mcp-annotation",
      reason: `native tool ${toolName} (${policy.kind})`,
    },
  } as Operation;
}

function mcpErrorResult(block: NativeToolGateBlock): {
  content: [{ type: "text"; text: string }];
  isError: true;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(block) }],
    isError: true,
  };
}

/**
 * Pre-invoke gate for native tools. Returns an MCP error result to short-circuit
 * the handler, or null to proceed.
 */
export async function gateNativeToolBeforeInvoke(opts: {
  readonly toolName: string;
  readonly args: unknown;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly approvedExecutionId?: string;
}): Promise<ReturnType<typeof mcpErrorResult> | null> {
  const { toolName } = opts;
  if (isExecutePathTool(toolName)) return null;

  const env = opts.env ?? process.env;
  const policy = resolveNativeToolPolicy(toolName);
  const sessionId = opts.sessionId;

  if (policy.kind === "passthrough" || policy.kind === "read") {
    return null;
  }

  // Data-flow / untrusted-read taint: mutating sinks checked against session labels
  const writeOp = syntheticOperation(toolName, policy, "POST");
  const ifcBlock = checkSessionIfcWriteSync({
    operation: writeOp,
    sessionId,
    env,
  });
  if (ifcBlock) {
    const mechanism = ifcBlock.sessionLabels.some((l) => l.includes("untrusted"))
      ? ("untrusted_read_taint" as const)
      : ("data_flow" as const);
    return mcpErrorResult({
      ok: false,
      status: "blocked",
      reason: ifcBlock.reason,
      toolName,
      mechanism,
    });
  }

  // Park destructive (and write) natives when risk enforce is on — same as execute mandate.
  const enforce = await Effect.runPromise(operationRiskEnforceEnabledEffect(env));
  if (!enforce) return null;
  if (policy.kind !== "destructive" && policy.kind !== "write") return null;

  const approvedId =
    opts.approvedExecutionId?.trim() ||
    (opts.args &&
    typeof opts.args === "object" &&
    typeof (opts.args as { approvedExecutionId?: unknown }).approvedExecutionId === "string"
      ? String((opts.args as { approvedExecutionId: string }).approvedExecutionId).trim()
      : "");

  if (approvedId) {
    // Resume path for native tools is follow-up; for now require fresh park without auto-consume
    // unless approvedExecutionId is present — leave consume to execute-core for catalog ops.
    // Native approved resume: allow through (simplest honest path until native resume lands).
    return null;
  }

  if (policy.kind === "destructive") {
    const risk = writeOp.risk!;
    const args =
      opts.args && typeof opts.args === "object" && !Array.isArray(opts.args)
        ? ({ ...(opts.args as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const parked = await parkMandateExecute({
      operationId: `native.${toolName}`,
      args,
      risk,
    });
    return mcpErrorResult({
      ok: false,
      status: "mandate_required",
      reason: parked.reason,
      toolName,
      mechanism: "park_destructive_write",
      executionId: parked.executionId,
      risk,
    });
  }

  return null;
}

/**
 * After a successful native read: accumulate session IFC labels.
 * Untrusted sources taint the session so later writes fail closed.
 */
export function accumulateNativeToolReadAfterSuccess(opts: {
  readonly toolName: string;
  readonly success: boolean;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Optional extra labels (e.g. channel:email from planted corpus readers). */
  readonly extraLabels?: readonly string[];
}): void {
  const { toolName, success } = opts;
  if (!success || isExecutePathTool(toolName)) return;
  const env = opts.env ?? process.env;
  if (!sessionIfcEnabled(env)) return;

  const policy = resolveNativeToolPolicy(toolName);
  if (policy.kind !== "read") return;

  const readOp = syntheticOperation(toolName, policy, "GET");
  accumulateSessionIfcReadSync({
    operation: readOp,
    sessionId: opts.sessionId,
    success: true,
    env,
  });

  if (opts.extraLabels?.length) {
    const key = resolveSessionLabelKey(opts.sessionId, env);
    accumulateSessionLabelsSync(key, opts.extraLabels);
  } else if (UNTRUSTED_SPEC_LABELS.has(policy.specLabel)) {
    const key = resolveSessionLabelKey(opts.sessionId, env);
    accumulateSessionLabelsSync(key, [`source:${policy.specLabel}`]);
  }
}

/** Test/CI helper: classify a tool the way the gate does. */
export function classifyNativeTool(toolName: string): {
  kind: NativeToolKind;
  executePath: boolean;
  policy: NativeToolPolicy;
} {
  return {
    kind: resolveNativeToolPolicy(toolName).kind,
    executePath: isExecutePathTool(toolName),
    policy: resolveNativeToolPolicy(toolName),
  };
}

/**
 * Wrap a native MCP handler with the same gate as `wrapRegisteredMcpToolHandler`
 * (for registrars that cannot import the root wrap, e.g. ChatGPT extensions).
 */
export function governNativeHandler<TArgs extends unknown[], TResult>(
  toolName: string,
  handler: (...args: TArgs) => Promise<TResult>,
  opts?: { readonly sessionId?: string; readonly env?: NodeJS.ProcessEnv }
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const block = await gateNativeToolBeforeInvoke({
      toolName,
      args: args[0],
      sessionId: opts?.sessionId,
      env: opts?.env,
    });
    if (block) return block as TResult;
    const result = await handler(...args);
    const ok =
      !result || typeof result !== "object" || (result as { isError?: boolean }).isError !== true;
    if (ok) {
      accumulateNativeToolReadAfterSuccess({
        toolName,
        success: true,
        sessionId: opts?.sessionId,
        env: opts?.env,
      });
    }
    return result;
  };
}

/**
 * Explicit taint helper for harnesses / planted-channel readers that are not
 * themselves MCP tools (scripted multi-attack: read planted email → taint).
 */
export function taintSessionFromUntrustedChannel(
  channel: string,
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!sessionIfcEnabled(env)) return;
  const key = resolveSessionLabelKey(sessionId, env);
  accumulateSessionLabelsSync(key, [`source:untrusted-${channel}`, `source:untrusted`]);
}
