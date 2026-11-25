/**
 * Resume a parked mandate execute after human approval (or decline).
 *
 * Approve is operator-only (CLI / Review / console) and records the human
 * principal on HUMAN_APPROVAL. MCP `resume` is decline-only — agents must
 * never self-approve.
 */

import { Effect } from "effect";
import { ArgsHash, ExecutionId, name } from "clawql-gdp";
import {
  decidePendingExecution,
  markPendingCompleted,
  type DecidePendingOptions,
} from "../pending/pending-execution-service.js";
import type { SourceProposalPrincipal } from "../sources/source-proposal-principal.js";
import { mandateArgsMatchEffect } from "../proofs/mandate-args-match.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { loadSpec } from "../spec/spec-loader.js";
import { executeApprovedMandateEffect } from "./mandate-execute.js";
import type { McpTextContent } from "./types.js";

export type ResumeExecuteParams = {
  readonly executionId: string;
  readonly decision?: "approve" | "decline";
  /**
   * Who is deciding. Required for approve (`kind: "operator"`).
   * MCP agents must not supply an operator principal.
   */
  readonly approvedBy?: SourceProposalPrincipal;
  /**
   * When `"mcp"`, approve is refused even if a principal is present
   * (defense in depth against a compromised session minting operator ids).
   */
  readonly channel?: "mcp" | "operator";
  readonly home?: string;
};

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export function resumeClawqlExecutionEffect(
  params: ResumeExecuteParams,
  loadSpecFn: LoadSpecFn = loadSpec
): Effect.Effect<McpTextContent[], Error> {
  return Effect.gen(function* () {
    const executionId = params.executionId.trim();
    const channel = params.channel ?? "operator";
    const decision = params.decision ?? (channel === "mcp" ? "decline" : "approve");

    if (channel === "mcp" && decision === "approve") {
      return [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error:
              "MCP resume is decline-only. Approve with `clawql resume <executionId>` " +
              "or Review/console — agents cannot self-approve mandates.",
          }),
        },
      ];
    }

    const decideOpts: DecidePendingOptions = {
      home: params.home,
      approvedBy: params.approvedBy,
    };

    if (decision === "decline") {
      const declined = yield* fromPromise(() =>
        decidePendingExecution(executionId, "decline", decideOpts)
      );
      return [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: true,
            status: "declined",
            executionId: declined.executionId,
            operationId: declined.operationId,
          }),
        },
      ];
    }

    const approved = yield* fromPromise(() =>
      decidePendingExecution(executionId, "approve", decideOpts)
    );
    const livePayload = {
      operationId: approved.operationId,
      args: approved.args,
      fields: approved.fields ?? undefined,
      where: approved.where ?? undefined,
    };
    const content = yield* name(
      ExecutionId(approved.executionId),
      ArgsHash(approved.argsHash),
      (execution, expectedHash) =>
        Effect.gen(function* () {
          const proof = yield* mandateArgsMatchEffect(execution, expectedHash, livePayload);
          if (!proof) {
            return yield* Effect.fail(new Error("MandateArgsMatch proof failed on resume"));
          }
          return yield* executeApprovedMandateEffect(
            execution,
            expectedHash,
            proof,
            {
              operationId: approved.operationId,
              args: approved.args,
              fields: approved.fields ?? undefined,
              where: approved.where ?? undefined,
              approvedExecutionId: approved.executionId,
            },
            loadSpecFn
          );
        })
    );

    const text = content[0]?.text ?? "";
    let ok = true;
    let error: string | undefined;
    try {
      const parsed = JSON.parse(text) as { ok?: boolean; status?: string; error?: string };
      if (
        parsed.ok === false ||
        parsed.status === "blocked" ||
        parsed.status === "mandate_required"
      ) {
        ok = false;
        error = parsed.error ?? parsed.status ?? "resume execute refused";
      } else if (
        typeof parsed.error === "string" &&
        parsed.error.length > 0 &&
        parsed.ok !== true
      ) {
        // Soft protocol errors often use { error } without ok:false
        if (!("results" in parsed) && !Array.isArray(parsed)) {
          ok = false;
          error = parsed.error;
        }
      }
    } catch {
      /* non-JSON success bodies still count as completed */
    }

    yield* fromPromise(() => markPendingCompleted(executionId, { ok, error }, params.home));

    return content;
  });
}

export async function resumeClawqlExecution(
  params: ResumeExecuteParams,
  loadSpecFn?: LoadSpecFn
): Promise<McpTextContent[]> {
  return Effect.runPromise(resumeClawqlExecutionEffect(params, loadSpecFn));
}
