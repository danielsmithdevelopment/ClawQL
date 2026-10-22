/**
 * Operator / auto path: authorize + redrive an outcome_unknown mandate with
 * the same clawql-mandate:<executionId> Idempotency-Key (no second consume).
 */

import { Effect } from "effect";
import {
  loadPendingExecution,
  mayAutoRetryOutcomeUnknown,
  resolvePendingOutcomeUnknown,
} from "../pending/pending-execution-service.js";
import type { PendingExecutionRecord } from "../pending/pending-execution-types.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { loadSpec } from "../spec/spec-loader.js";
import { executeClawqlOperationEffect } from "./execute-core.js";

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/**
 * Authorize keyed retry (WORM) then re-execute the parked payload.
 * Finalizes completed/failed via execute-core markPendingCompleted.
 */
export function redriveOutcomeUnknownWithKeyEffect(
  executionId: string,
  loadSpecFn: LoadSpecFn = loadSpec,
  home?: string
): Effect.Effect<PendingExecutionRecord, Error> {
  return Effect.gen(function* () {
    const id = executionId.trim();
    const before = yield* fromPromise(() => loadPendingExecution(id, home));
    if (!before) {
      return yield* Effect.fail(new Error(`Unknown executionId: ${id}`));
    }
    if (!mayAutoRetryOutcomeUnknown(before)) {
      return yield* Effect.fail(
        new Error(
          `Keyed redrive refused: status=${before.status} idempotencyCapable=${before.idempotencyCapable}`
        )
      );
    }
    yield* fromPromise(() => resolvePendingOutcomeUnknown(id, "retry_with_key", home));
    yield* executeClawqlOperationEffect(
      {
        operationId: before.operationId,
        args: before.args,
        fields: before.fields ?? undefined,
        where: before.where ?? undefined,
        approvedExecutionId: before.executionId,
      },
      loadSpecFn
    );
    const after = yield* fromPromise(() => loadPendingExecution(id, home));
    if (!after) {
      return yield* Effect.fail(new Error(`Execution ${id} missing after redrive`));
    }
    return after;
  });
}

export async function redriveOutcomeUnknownWithKey(
  executionId: string,
  loadSpecFn?: LoadSpecFn,
  home?: string
): Promise<PendingExecutionRecord> {
  return Effect.runPromise(redriveOutcomeUnknownWithKeyEffect(executionId, loadSpecFn, home));
}
