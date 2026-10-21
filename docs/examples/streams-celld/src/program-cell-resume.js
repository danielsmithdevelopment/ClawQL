/**
 * Pure ADR 0015 resume decision for ProgramCellDO (unit-testable, no DO I/O).
 *
 * @param {{
 *   hasEntry: boolean,
 *   hasIntent: boolean,
 *   isWrite: boolean,
 *   intentHasUpstreamResult?: boolean,
 *   pauseKind?: string | null,
 *   pausedAtIndex?: number | null,
 *   callIndex?: number,
 * }} input
 * @returns {{ action: "replay" | "outcome_unknown" | "rerun" | "finalize_upstream" }}
 */
export function decideCallResume(input) {
  const hasEntry = input?.hasEntry === true;
  const hasIntent = input?.hasIntent === true;
  const isWrite = input?.isWrite === true;
  const intentHasUpstreamResult = input?.intentHasUpstreamResult === true;
  const pauseKind = input?.pauseKind != null ? String(input.pauseKind) : "";
  const pausedAtIndex =
    typeof input?.pausedAtIndex === "number" ? input.pausedAtIndex : null;
  const callIndex = typeof input?.callIndex === "number" ? input.callIndex : null;
  const atPausedWrite =
    pausedAtIndex != null && callIndex != null && pausedAtIndex === callIndex;

  if (hasEntry) return { action: "replay" };
  // Call returned but entry not journaled — finalize from stashed result (no re-send).
  if (intentHasUpstreamResult) return { action: "finalize_upstream" };
  if (hasIntent && isWrite) return { action: "outcome_unknown" };
  // Peer may see meta.pauseKind before/without the intent key after fleet ownership
  // transfer — never re-send a write that was already past intent / in-flight.
  if (
    isWrite &&
    atPausedWrite &&
    (pauseKind === "after_intent_before_call" ||
      pauseKind === "during_call" ||
      pauseKind === "after_write_intent")
  ) {
    return { action: "outcome_unknown" };
  }
  if (
    isWrite &&
    atPausedWrite &&
    pauseKind === "after_call_before_journal" &&
    !intentHasUpstreamResult
  ) {
    // Stash missing on peer — cannot safely re-send; person resolves.
    return { action: "outcome_unknown" };
  }
  return { action: "rerun" };
}

/**
 * @param {{ method?: string, risk?: string }} call
 */
export function isWriteCall(call) {
  if (call?.risk === "write") return true;
  if (call?.risk === "read") return false;
  const method = String(call?.method || "").toUpperCase();
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}
