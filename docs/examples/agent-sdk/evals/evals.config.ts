/**
 * Copy to: evals/evals.config.ts (merge with an existing config if present).
 *
 * Injection cases are soft by default — use `agent-sdk eval --strict` when you
 * want soft misses to fail the build.
 */
import { defineEvalConfig } from "@grok/agent-sdk/evals";

export default defineEvalConfig({
  maxConcurrency: 4,
  tags: ["clawql", "injection"],
});
