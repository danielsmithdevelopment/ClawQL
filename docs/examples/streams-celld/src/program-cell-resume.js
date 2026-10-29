/**
 * Pure ADR 0015 resume decision for ProgramCellDO (unit-testable, no DO I/O).
 *
 * Digest match mirrors packages/clawql-api durable-runner `entryMatchesCall`:
 * when a journal entry exists but no longer matches the plan call at that index,
 * recovery must hard-stop (`journal_divergence`) — do not continue later steps.
 */

/** Stable JSON: sorted object keys, arrays in order, undefined omitted. */
export function canonicalizeForHash(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value;
  const out = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    out[key] = sortKeys(v);
  }
  return out;
}

/**
 * Args a journal entry is bound to for an execute plan call.
 * @param {{ tool?: string, args?: Record<string, unknown>, query?: string, limit?: number }} call
 */
export function journaledArgs(call) {
  if (call?.tool === "search") {
    return {
      query: call.query,
      ...(call.limit !== undefined ? { limit: call.limit } : {}),
    };
  }
  return { ...(call?.args || {}) };
}

/**
 * @param {{
 *   tool?: string,
 *   callId?: string,
 *   operationId?: string,
 *   args?: Record<string, unknown>,
 * }} entry
 * @param {{
 *   tool?: string,
 *   operationId?: string,
 *   args?: Record<string, unknown>,
 *   query?: string,
 *   limit?: number,
 * }} call
 * @param {number} index
 */
export function entryMatchesCall(entry, call, index) {
  if (!entry || !call) return false;
  const expectedTool = call.tool || "execute";
  const expectedCallId = `c${index}`;
  const expectedOp = expectedTool === "execute" ? call.operationId : undefined;
  return (
    entry.tool === expectedTool &&
    entry.callId === expectedCallId &&
    entry.operationId === expectedOp &&
    canonicalizeForHash(entry.args ?? {}) === canonicalizeForHash(journaledArgs(call))
  );
}

/**
 * @param {{
 *   hasEntry: boolean,
 *   hasIntent: boolean,
 *   isWrite: boolean,
 *   intentHasUpstreamResult?: boolean,
 *   pauseKind?: string | null,
 *   pausedAtIndex?: number | null,
 *   callIndex?: number,
 *   entryMatches?: boolean,
 * }} input
 * @returns {{
 *   action:
 *     | "replay"
 *     | "outcome_unknown"
 *     | "rerun"
 *     | "finalize_upstream"
 *     | "journal_divergence",
 * }}
 */
export function decideCallResume(input) {
  const hasEntry = input?.hasEntry === true;
  const hasIntent = input?.hasIntent === true;
  const isWrite = input?.isWrite === true;
  const intentHasUpstreamResult = input?.intentHasUpstreamResult === true;
  const pauseKind = input?.pauseKind != null ? String(input.pauseKind) : "";
  const pausedAtIndex = typeof input?.pausedAtIndex === "number" ? input.pausedAtIndex : null;
  const callIndex = typeof input?.callIndex === "number" ? input.callIndex : null;
  const atPausedWrite = pausedAtIndex != null && callIndex != null && pausedAtIndex === callIndex;

  // Digest hard-stop: entry present but plan/args no longer match → do not continue.
  if (hasEntry && input?.entryMatches === false) {
    return { action: "journal_divergence" };
  }
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
