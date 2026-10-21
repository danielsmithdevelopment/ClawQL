/**
 * Native MCP tool gate — same properties as execute-core for ClawQL-owned tools:
 * session IFC (data-flow) + park destructive writes for approval.
 *
 * Called from `wrapRegisteredMcpToolHandler` so every registered tool hits this
 * choke point (proxy hooks already run first).
 *
 * Gentler defaults:
 * - Untrusted → **labelable** sinks (memory): allow write, stamp untrusted provenance.
 * - Untrusted → **blocking** sinks (external / privileged): refuse.
 * - `memory_ingest` parks only on overwrite (`append: false`), not clean appends.
 */

import { Effect } from "effect";
import type { Operation } from "../spec/operation-types.js";
import {
  accumulateSessionIfcReadSync,
  checkSessionIfcWriteSync,
  sessionIfcEnabled,
} from "../ifc/session-ifc-enforce.js";
import {
  accumulateSessionLabelsSync,
  getSessionLabelsSync,
  resolveSessionLabelKey,
} from "../ifc/session-label-store.js";
import { operationRiskEnforceEnabledEffect } from "../risk/operation-risk-enforce.js";
import { parkMandateExecute } from "../pending/pending-execution-service.js";
import {
  CLAWQL_TRUST_BODY_MARKER,
  CLAWQL_UNTRUSTED_TAG,
  effectiveNativeParkKind,
  isExecutePathTool,
  NATIVE_TOOL_GOVERNANCE_MODULE_ID,
  resolveNativeIfcSink,
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
  method: "GET" | "POST",
  parkKind: NativeToolKind = policy.kind
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
      mcpDestructiveHint: parkKind === "destructive",
    },
    risk: {
      // Park overwrites only: non-destructive writes stay allow (labelable memory path).
      policy: parkKind === "destructive" ? "mandate" : "allow",
      level: parkKind === "destructive" ? "HIGH" : parkKind === "write" ? "MEDIUM" : "LOW",
      source: "mcp-annotation",
      reason: `native tool ${toolName} (${parkKind})`,
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

function asRecord(args: unknown): Record<string, unknown> | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  return args as Record<string, unknown>;
}

/**
 * Where untrusted content is headed on a blocking sink (notify / send).
 * - same_source: reply to the channel that produced the taint (not exfil)
 * - internal: team / internal audience
 * - external: third party — refuse when session is tainted
 */
export type OutboundDestClass = "same_source" | "internal" | "external";

export function classifyOutboundDestination(
  args: unknown,
  sessionLabels: readonly string[]
): OutboundDestClass {
  const rec = asRecord(args) ?? {};
  if (rec.reply_to_source === true || rec.destination === "same_source") {
    return "same_source";
  }
  if (rec.destination === "internal" || rec.audience === "internal" || rec.internal === true) {
    return "internal";
  }
  if (rec.reply_to != null && String(rec.reply_to).trim() !== "") {
    return "same_source";
  }

  const channel = String(rec.channel ?? rec.to ?? rec.recipient ?? "")
    .trim()
    .toLowerCase();
  if (channel.startsWith("reply:")) return "same_source";

  const sourceChannels = sessionLabels
    .map((l) => {
      const m = l.match(/source:untrusted-([a-z0-9_-]+)/i);
      return m?.[1]?.toLowerCase();
    })
    .filter((c): c is string => Boolean(c));
  for (const ch of sourceChannels) {
    if (
      channel === ch ||
      channel.includes(`reply-${ch}`) ||
      channel.includes(`${ch}-sender`) ||
      channel.endsWith(`@${ch}`)
    ) {
      return "same_source";
    }
  }

  if (/^#(team|eng|internal|ops|security)\b/.test(channel)) return "internal";
  if (channel.startsWith("internal:") || channel.includes("@internal.")) {
    return "internal";
  }
  if (typeof rec.reviewer === "string" && /@internal\./i.test(rec.reviewer)) {
    return "internal";
  }

  return "external";
}

/**
 * DRIFT-style injection isolator: strip instruction-like spans that conflict
 * with ordinary note content before they persist in memory. Audit labels still
 * stamp via {@link stampUntrustedProvenance}.
 */
const INJECTION_ISOLATOR_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/gi,
  /\bdisregard\s+(all\s+)?(previous|prior)\b/gi,
  /\byou\s+are\s+now\s+(in\s+)?(developer|DAN|unrestricted)\s*mode\b/gi,
  /\bsystem\s+override\b/gi,
  /\bOVERRIDE\b/g,
  /\bdo\s+not\s+follow\s+(your|the)\s+(system|safety)\s+(prompt|rules?)\b/gi,
];

export function isolateInjectionInstructions(text: string): {
  readonly text: string;
  readonly stripped: boolean;
} {
  if (!text) return { text, stripped: false };
  let out = text;
  let stripped = false;
  for (const re of INJECTION_ISOLATOR_PATTERNS) {
    const next = out.replace(re, "[clawql-isolated-instruction]");
    if (next !== out) stripped = true;
    out = next;
  }
  return { text: out, stripped };
}

/**
 * B3 — argument provenance: detect secret-bearing payloads that must not ride
 * an "internal" notify after untrusted taint (allowed-tool exfil).
 */
export function payloadLooksLikeSecretExfil(args: unknown): boolean {
  let blob = "";
  try {
    blob = JSON.stringify(args ?? {});
  } catch {
    blob = String(args ?? "");
  }
  return (
    /vault[_-]?secret/i.test(blob) ||
    /CLAWQL_SECRET/i.test(blob) ||
    /\bsk-[a-zA-Z0-9]{16,}\b/.test(blob) ||
    /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_\-]{12,}/i.test(blob) ||
    /BEGIN (RSA |OPENSSH )?PRIVATE KEY/.test(blob) ||
    /password\s*[:=]\s*['"]?[^\s'"]{8,}/i.test(blob)
  );
}

/**
 * Stamp untrusted provenance onto a memory write payload so the vault note
 * carries labels that later recalls re-accumulate into the session.
 * Mutates `args` in place when it is a plain object.
 * Also runs the injection isolator on `insights` / string bodies (B2).
 */
export function stampUntrustedProvenance(args: unknown, sessionLabels: readonly string[]): void {
  const rec = asRecord(args);
  if (!rec) return;

  if (typeof rec.insights === "string") {
    const iso = isolateInjectionInstructions(rec.insights);
    rec.insights = iso.text;
    if (iso.stripped) rec.clawql_injection_isolated = true;
  }
  if (typeof rec.text === "string") {
    const iso = isolateInjectionInstructions(rec.text);
    rec.text = iso.text;
    if (iso.stripped) rec.clawql_injection_isolated = true;
  }

  const tags = Array.isArray(rec.tags)
    ? rec.tags.filter((t): t is string => typeof t === "string")
    : [];
  if (!tags.includes(CLAWQL_UNTRUSTED_TAG)) tags.push(CLAWQL_UNTRUSTED_TAG);
  rec.tags = tags;

  const sources = Array.isArray(rec.sources)
    ? [...(rec.sources as Array<Record<string, string | number>>)]
    : [];
  sources.push({
    trust: "untrusted",
    labels: [...sessionLabels].sort().join(","),
  });
  rec.sources = sources;

  const labelLine = `**clawql_trust_labels:** ${[...sessionLabels].sort().join(", ")}`;
  if (typeof rec.insights === "string") {
    if (!rec.insights.includes(CLAWQL_TRUST_BODY_MARKER)) {
      rec.insights = `${rec.insights}\n\n${CLAWQL_TRUST_BODY_MARKER}\n${labelLine}`;
    }
  } else {
    rec.insights = `${CLAWQL_TRUST_BODY_MARKER}\n${labelLine}`;
  }
}

/** Detect untrusted provenance markers in vault recall / note text. */
export function extractUntrustedLabelsFromText(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  if (text.includes(CLAWQL_UNTRUSTED_TAG) || text.includes(CLAWQL_TRUST_BODY_MARKER)) {
    found.push("source:untrusted");
  }
  const m = text.match(/\*\*clawql_trust_labels:\*\*\s*([^\n]+)/);
  if (m?.[1]) {
    for (const part of m[1].split(",")) {
      const lbl = part.trim().replace(/^\*+\s*/, "");
      if (lbl.startsWith("source:")) found.push(lbl);
    }
  }
  // OKF sources row: `labels: source:untrusted-email,...` (avoid matching clawql_trust_labels)
  const src = text.match(/(?:^|\n)\s*labels:\s*["']?([^"'\n]+)/);
  if (src?.[1] && src[1].includes("untrusted")) {
    for (const part of src[1].split(",")) {
      const lbl = part.trim().replace(/^\*+\s*/, "");
      if (lbl.startsWith("source:")) found.push(lbl);
    }
  }
  return [...new Set(found)];
}

function toolResultToText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result !== "object") return String(result);
  const rec = result as { content?: Array<{ text?: string }>; text?: string };
  if (typeof rec.text === "string") return rec.text;
  if (Array.isArray(rec.content)) {
    return rec.content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n");
  }
  try {
    return JSON.stringify(result);
  } catch {
    return "";
  }
}

/**
 * Pre-invoke gate for native tools. Returns an MCP error result to short-circuit
 * the handler, or null to proceed (possibly after stamping untrusted provenance).
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
  const parkKind = effectiveNativeParkKind(toolName, opts.args, policy);

  if (policy.kind === "passthrough" || policy.kind === "read") {
    return null;
  }

  // Data-flow / untrusted-read taint: mutating sinks checked against session labels
  const writeOp = syntheticOperation(toolName, policy, "POST", parkKind);
  const ifcBlock = checkSessionIfcWriteSync({
    operation: writeOp,
    sessionId,
    env,
  });
  if (ifcBlock) {
    const sink = resolveNativeIfcSink(policy);
    const taintedUntrusted = ifcBlock.sessionLabels.some((l) => l.includes("untrusted"));
    if (sink === "labelable") {
      // Gentler default: store with untrusted label instead of blocking the write.
      stampUntrustedProvenance(opts.args, ifcBlock.sessionLabels);
    } else {
      // Same-source reply and internal destinations are ordinary work, not exfil —
      // unless the payload looks like secret exfil through an allowed tool (B3).
      const dest = classifyOutboundDestination(opts.args, ifcBlock.sessionLabels);
      if (dest === "same_source") {
        // allow through
      } else if (dest === "internal" && !payloadLooksLikeSecretExfil(opts.args)) {
        // allow through
      } else {
        const mechanism = taintedUntrusted
          ? ("untrusted_read_taint" as const)
          : ("data_flow" as const);
        const secret = payloadLooksLikeSecretExfil(opts.args);
        return mcpErrorResult({
          ok: false,
          status: "blocked",
          reason: secret
            ? "Blocked secret-bearing payload on outbound sink after untrusted read (allowed-tool exfil)"
            : ifcBlock.reason,
          toolName,
          mechanism,
        });
      }
    }
  }

  // Park destructive natives when risk enforce is on — same as execute mandate.
  // memory_ingest: only overwrite (append:false) is destructive; appends proceed.
  // notify: same-source / internal destinations are ordinary work (do not park).
  const enforce = await Effect.runPromise(operationRiskEnforceEnabledEffect(env));
  if (!enforce) return null;
  if (parkKind !== "destructive") return null;

  if (toolName === "notify") {
    const sessionKey = resolveSessionLabelKey(sessionId, env);
    const labels = [...getSessionLabelsSync(sessionKey)];
    const dest = classifyOutboundDestination(opts.args, labels);
    if (dest === "same_source" || dest === "internal") return null;
  }

  const approvedId =
    opts.approvedExecutionId?.trim() ||
    (opts.args &&
    typeof opts.args === "object" &&
    typeof (opts.args as { approvedExecutionId?: unknown }).approvedExecutionId === "string"
      ? String((opts.args as { approvedExecutionId: string }).approvedExecutionId).trim()
      : "");

  if (approvedId) {
    // Native approved resume: allow through (simplest honest path until native resume lands).
    return null;
  }

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
    reason:
      toolName === "memory_ingest"
        ? "Overwrite of an existing memory note requires a mandate before execute"
        : parked.reason,
    toolName,
    mechanism: "park_destructive_write",
    executionId: parked.executionId,
    risk,
  });
}

/**
 * After a successful native read: accumulate session IFC labels.
 * Untrusted sources taint the session so later blocking sinks fail closed.
 * Vault notes carrying `clawql-untrusted` re-taint on recall (persistent injection).
 */
export function accumulateNativeToolReadAfterSuccess(opts: {
  readonly toolName: string;
  readonly success: boolean;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Optional extra labels (e.g. channel:email from planted corpus readers). */
  readonly extraLabels?: readonly string[];
  /** Tool result body — scanned for vault untrusted provenance on recall. */
  readonly result?: unknown;
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

  const key = resolveSessionLabelKey(opts.sessionId, env);
  if (opts.extraLabels?.length) {
    accumulateSessionLabelsSync(key, opts.extraLabels);
  } else if (UNTRUSTED_SPEC_LABELS.has(policy.specLabel)) {
    accumulateSessionLabelsSync(key, [`source:${policy.specLabel}`]);
  }

  // Persistent injection: labeled-untrusted vault content re-taints the reader.
  if (toolName === "memory_recall" || toolName === "read_around") {
    const text = toolResultToText(opts.result);
    const fromNote = extractUntrustedLabelsFromText(text);
    if (fromNote.length) {
      accumulateSessionLabelsSync(key, fromNote);
    }
  }
}

/** Test/CI helper: classify a tool the way the gate does. */
export function classifyNativeTool(toolName: string): {
  kind: NativeToolKind;
  executePath: boolean;
  policy: NativeToolPolicy;
  ifcSink: ReturnType<typeof resolveNativeIfcSink>;
} {
  const policy = resolveNativeToolPolicy(toolName);
  return {
    kind: policy.kind,
    executePath: isExecutePathTool(toolName),
    policy,
    ifcSink: resolveNativeIfcSink(policy),
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
        result,
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

/** Re-taint a session from vault note text (harness / later-session recall). */
export function taintSessionFromVaultNoteText(
  text: string,
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (!sessionIfcEnabled(env)) return [];
  const labels = extractUntrustedLabelsFromText(text);
  if (!labels.length) return [];
  const key = resolveSessionLabelKey(sessionId, env);
  accumulateSessionLabelsSync(key, labels);
  return labels;
}

/** Snapshot session labels (harness / tests). */
export function peekSessionLabels(
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const key = resolveSessionLabelKey(sessionId, env);
  return [...getSessionLabelsSync(key)].sort();
}
