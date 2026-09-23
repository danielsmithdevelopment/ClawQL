/**
 * Permanent isolation decision rule (ADR 0011 §3.2).
 * Classify new workloads explicitly — never by analogy to existing hosts.
 */

import { Context, Effect, Layer } from "effect";

/** Which isolation host a workload must use. */
export type IsolationHostKind = "clawql-sandbox-agent-substrate" | "celld-v8-isolate";

export type IsolationWorkloadClass =
  | "untrusted_arbitrary_code"
  | "fixed_shape_orchestration";

export type IsolationDecisionInput = {
  readonly workloadId: string;
  /**
   * True when behavior is not fully known/fixed in advance (agent-authored
   * scripts, model-generated tools, genuine host-escape / credential-theft risk).
   */
  readonly behaviorNotFullyKnownInAdvance: boolean;
  /** Optional human rationale recorded for operators / WORM metadata. */
  readonly rationale?: string;
};

export type IsolationDecision = {
  readonly workloadId: string;
  readonly workloadClass: IsolationWorkloadClass;
  readonly host: IsolationHostKind;
  readonly rationale: string;
};

export function classifyIsolationWorkload(
  input: IsolationDecisionInput
): IsolationDecision {
  if (input.behaviorNotFullyKnownInAdvance) {
    return {
      workloadId: input.workloadId,
      workloadClass: "untrusted_arbitrary_code",
      host: "clawql-sandbox-agent-substrate",
      rationale:
        input.rationale ??
        "Untrusted/unpredictable code → clawql-sandbox (Agent Substrate: Cloud Hypervisor or gVisor)",
    };
  }
  return {
    workloadId: input.workloadId,
    workloadClass: "fixed_shape_orchestration",
    host: "celld-v8-isolate",
    rationale:
      input.rationale ??
      "Fixed-shape orchestration with bounded actions → celld / clawql-cellrt (V8 isolate); Panguard still enforces execute()",
  };
}

export class IsolationDecisionService extends Context.Tag(
  "clawql/IsolationDecisionService"
)<
  IsolationDecisionService,
  {
    readonly classify: (
      input: IsolationDecisionInput
    ) => Effect.Effect<IsolationDecision>;
  }
>() {}

export const IsolationDecisionLive: Layer.Layer<IsolationDecisionService> = Layer.succeed(
  IsolationDecisionService,
  {
    classify: (input) => Effect.sync(() => classifyIsolationWorkload(input)),
  }
);

/** Canonical examples used in docs/tests — not exhaustive. */
export const ISOLATION_DECISION_EXAMPLES = {
  sandboxExec: classifyIsolationWorkload({
    workloadId: "sandbox_exec",
    behaviorNotFullyKnownInAdvance: true,
    rationale: "MCP sandbox_exec runs operator/agent-supplied snippets",
  }),
  celldCell: classifyIsolationWorkload({
    workloadId: "streams-celld-cell",
    behaviorNotFullyKnownInAdvance: false,
    rationale: "celld cells are fixed-shape TypeScript with no child_process/fs/net",
  }),
} as const;
