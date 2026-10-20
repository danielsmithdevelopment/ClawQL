/**
 * Same 14-case benign suite as ClawQL (`benign.mjs`) for peer arms.
 *
 * Equal-arm peers front Obsidian Memory/ over MCP. Best-config only gates
 * memory_ingest (omit / policies.block). Non-vault tools are not on that
 * fixture — they are scored as not blocked by peer hardening (same-source /
 * internal notify; search/cache/audit/skills). Third-party notify still
 * expects blocked (no public exfil channel on the vault MCP).
 *
 * Headline: matched_expect of 14. Break out memory_writes_* under the table.
 */
import { BENIGN_CASES, runBenignSuite } from "./benign.mjs";

/** Keep in sync with BENIGN_CASES that call memory_ingest. */
export const MEMORY_INGEST_CASE_IDS = Object.freeze([
  "benign_ingest_clean_summary",
  "benign_email_then_summary",
  "benign_ticket_then_digest",
  "benign_doc_then_notes",
  "benign_second_clean_append",
]);

/**
 * @param {import('./benign.mjs').BenignCtx} ctx
 */
export async function runPeerBenignSuite(ctx) {
  const suite = await runBenignSuite(ctx);
  const writeResults = suite.results.filter((r) =>
    MEMORY_INGEST_CASE_IDS.includes(r.id)
  );
  const memory_writes_planted = writeResults.length;
  const memory_writes_completed = writeResults.filter(
    (r) => r.status === "complete"
  ).length;
  const memory_writes_matched = writeResults.filter((r) => r.matched_expect).length;
  return {
    ...suite,
    memory_writes_planted,
    memory_writes_completed,
    memory_writes_matched_expect: memory_writes_matched,
    memory_write_completion_rate:
      memory_writes_planted === 0
        ? 0
        : memory_writes_completed / memory_writes_planted,
    note: "Same 14 benign cases as ClawQL. Memory-write breakout shows where peer tool omit/deny costs capability.",
  };
}

export { BENIGN_CASES, runBenignSuite };
