/**
 * Proof helper: result tokens must equal tokens of ClawQL MCP response text
 * (server bytes), not a client-reshaped observation.
 */
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("cl100k_base");

export function countTokens(text) {
  if (text == null || text === "") return 0;
  return enc.encode(String(text)).length;
}

/**
 * @param {string} mcpText raw toolText from execute / execute_program
 * @param {number} reportedResultTokens board step.resultTokens
 */
export function assertResultTokensFromServerBytes(mcpText, reportedResultTokens) {
  const fromBytes = countTokens(mcpText);
  if (fromBytes !== reportedResultTokens) {
    throw new Error(
      `result token mismatch: board=${reportedResultTokens} server_bytes=${fromBytes}`
    );
  }
  return fromBytes;
}
