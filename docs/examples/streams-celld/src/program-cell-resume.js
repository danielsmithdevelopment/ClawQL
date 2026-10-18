/**
 * Pure ADR 0015 resume decision for ProgramCellDO (unit-testable, no DO I/O).
 *
 * @param {{ hasEntry: boolean, hasIntent: boolean, isWrite: boolean }} input
 * @returns {{ action: "replay" | "outcome_unknown" | "rerun" }}
 */
export function decideCallResume(input) {
  const hasEntry = input?.hasEntry === true;
  const hasIntent = input?.hasIntent === true;
  const isWrite = input?.isWrite === true;
  if (hasEntry) return { action: "replay" };
  if (hasIntent && isWrite) return { action: "outcome_unknown" };
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
