/**
 * Fleet structural step-state compare (claim-path §1 statePreserved).
 *
 * Twin of packages/clawql-api program-step-state slices, but omits volatile
 * result bodies (pets owners.create ids / timestamps). Node Effect golden stays
 * the strict unit proof; fleet quotes structural preserve rates.
 */

import { canonicalizeForHash } from "./program-cell-resume.js";

/**
 * @param {{
 *   index?: number,
 *   tool?: string,
 *   operationId?: string,
 *   ok?: boolean,
 *   status?: string,
 *   result?: { ok?: boolean, status?: string },
 *   outcomeUnknown?: boolean,
 * }} call
 */
export function projectStructuralStep(call, index = 0) {
  const tool = call?.tool || "execute";
  const ok =
    typeof call?.ok === "boolean"
      ? call.ok
      : typeof call?.result?.ok === "boolean"
        ? call.result.ok
        : !call?.outcomeUnknown;
  const status =
    call?.status || call?.result?.status || (call?.outcomeUnknown ? "outcome_unknown" : undefined);
  return {
    index: typeof call?.index === "number" ? call.index : index,
    tool,
    ...(tool === "execute" && call?.operationId ? { operationId: call.operationId } : {}),
    ok: Boolean(ok),
    ...(status !== undefined ? { status: String(status) } : {}),
  };
}

/**
 * @param {readonly unknown[]} calls
 */
export function projectStructuralSteps(calls) {
  const list = Array.isArray(calls) ? calls : [];
  return list.map((c, i) => projectStructuralStep(c, i));
}

/**
 * @param {readonly unknown[]} baselineCalls
 * @param {readonly unknown[]} observedCalls
 */
export function compareStructuralStepState(baselineCalls, observedCalls) {
  const baseline = projectStructuralSteps(baselineCalls);
  const observed = projectStructuralSteps(observedCalls);
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
  return {
    preserved: mismatchIndexes.length === 0 && baseline.length === observed.length,
    mismatchIndexes,
    baseline,
    observed,
    meaning:
      "claim-path §1 fleet — structural step outcomes (index/tool/op/ok/status) match a no-crash baseline; volatile result bodies omitted",
  };
}
