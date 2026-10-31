/**
 * Fleet step-state compare (claim-path §1 statePreserved).
 *
 * Exact digest equality of step slices (index/tool/op/ok/status/error +
 * canonical result body) and the program-level result digest — same meaning as
 * Node `compareProgramStepStateEffect`. Volatile host flags (`replayed`,
 * `resumed`, `finalizedFromIntent`, `completedAt`, `callId`) are omitted so a
 * resumed journal can match a no-crash twin that used the same plan args.
 */

import { canonicalizeForHash } from "./program-cell-resume.js";

/**
 * Strip resume-only / host-volatile fields from a call result before digesting.
 * @param {unknown} result
 */
function digestsableResult(result) {
  if (result === undefined || result === null) return null;
  if (typeof result !== "object" || Array.isArray(result)) return result;
  const r = /** @type {Record<string, unknown>} */ (result);
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (
      k === "replayed" ||
      k === "resumed" ||
      k === "finalizedFromIntent" ||
      k === "completedAt" ||
      k === "callId"
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * @param {{
 *   index?: number,
 *   tool?: string,
 *   operationId?: string,
 *   ok?: boolean,
 *   status?: string,
 *   error?: string,
 *   result?: { ok?: boolean, status?: string, value?: unknown, error?: string },
 *   outcomeUnknown?: boolean,
 * }} call
 */
export function projectDigestStep(call, index = 0) {
  const tool = call?.tool || "execute";
  const ok =
    typeof call?.ok === "boolean"
      ? call.ok
      : typeof call?.result?.ok === "boolean"
        ? call.result.ok
        : !call?.outcomeUnknown;
  const status =
    call?.status || call?.result?.status || (call?.outcomeUnknown ? "outcome_unknown" : undefined);
  const error =
    typeof call?.error === "string"
      ? call.error
      : typeof call?.result?.error === "string"
        ? call.result.error
        : undefined;
  const resultBody = digestsableResult(call?.result);
  return {
    index: typeof call?.index === "number" ? call.index : index,
    tool,
    ...(tool === "execute" && call?.operationId ? { operationId: call.operationId } : {}),
    ok: Boolean(ok),
    ...(status !== undefined ? { status: String(status) } : {}),
    ...(error !== undefined ? { error: String(error) } : {}),
    resultDigest: resultBody === null ? null : canonicalizeForHash(resultBody),
  };
}

/**
 * @param {readonly unknown[]} calls
 */
export function projectDigestSteps(calls) {
  const list = Array.isArray(calls) ? calls : [];
  return list.map((c, i) => projectDigestStep(c, i));
}

/** @deprecated Use projectDigestStep — kept as alias for older imports. */
export const projectStructuralStep = projectDigestStep;
/** @deprecated Use projectDigestSteps. */
export const projectStructuralSteps = projectDigestSteps;

/**
 * @param {readonly unknown[]} baselineCalls
 * @param {readonly unknown[]} observedCalls
 * @param {unknown} [baselineResult]
 * @param {unknown} [observedResult]
 */
export function compareDigestStepState(
  baselineCalls,
  observedCalls,
  baselineResult = undefined,
  observedResult = undefined
) {
  const baseline = projectDigestSteps(baselineCalls);
  const observed = projectDigestSteps(observedCalls);
  const mismatchIndexes = [];
  const n = Math.max(baseline.length, observed.length);
  for (let i = 0; i < n; i++) {
    if (
      baseline[i] === undefined ||
      observed[i] === undefined ||
      canonicalizeForHash(baseline[i]) !== canonicalizeForHash(observed[i])
    ) {
      mismatchIndexes.push(i);
    }
  }
  const stepsMatch = mismatchIndexes.length === 0 && baseline.length === observed.length;
  const baselineResultDigest =
    baselineResult === undefined || baselineResult === null
      ? null
      : canonicalizeForHash(baselineResult);
  const observedResultDigest =
    observedResult === undefined || observedResult === null
      ? null
      : canonicalizeForHash(observedResult);
  // When either side omits program result, only step digests decide (fleet often
  // compares calls[] alone; Node unit tests pass both).
  const resultMatch =
    baselineResult === undefined || observedResult === undefined
      ? true
      : baselineResultDigest === observedResultDigest;
  return {
    preserved: stepsMatch && resultMatch,
    stepsMatch,
    resultMatch,
    mismatchIndexes,
    baseline,
    observed,
    baselineResultDigest,
    observedResultDigest,
    meaning:
      "claim-path §1 fleet — exact digest equality of step slices (index/tool/op/ok/status/error/result body) and program result vs a no-crash twin with the same plan args",
  };
}

/** @deprecated Use compareDigestStepState. */
export function compareStructuralStepState(baselineCalls, observedCalls) {
  return compareDigestStepState(baselineCalls, observedCalls);
}
