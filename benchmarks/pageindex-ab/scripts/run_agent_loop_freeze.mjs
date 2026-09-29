#!/usr/bin/env node
/**
 * Strong-model agent-loop freeze scaffold (Track B).
 *
 * Proves ClawQL pageindex_* and codegraph_* vs grep on unique jobs.
 * Full tool loop lands when ClawQL MCP + OPENROUTER_API_KEY are wired;
 * this entrypoint validates cohort/arms and writes a schedule manifest.
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run
 *   node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --arms A-grep,A-pageindex
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {
    dryRun: false,
    corpus: "hard-candidate",
    cohort: "deep-rfc",
    arms: ["A-grep", "A-pageindex"],
    // Must match Track A VECTIFY_FAIR_MODEL (fair_test_common.FRONTIER_MODEL).
    model:
      process.env.PAGEINDEX_AB_AGENT_MODEL ||
      process.env.VECTIFY_FAIR_MODEL ||
      "anthropic/claude-sonnet-4.6",
    out: path.join(ROOT, "results", "agent-loop-freeze"),
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--corpus") out.corpus = argv[++i];
    else if (a === "--cohort") out.cohort = argv[++i];
    else if (a === "--arms") out.arms = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--model") out.model = argv[++i];
    else if (a === "--out") out.out = path.resolve(argv[++i]);
  }
  return out;
}

function loadDeepRfcIds() {
  const p = path.join(ROOT, "design", "deep-rfc-misses.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return j.question_ids;
}

const ARM_TOOLS = {
  "A-grep": ["grep", "read_around"],
  "A-pageindex": [
    "pageindex_traverse",
    "pageindex_get_content",
    "pageindex_synthesize",
    "read_around",
  ],
  "A-codegraph": [
    "codegraph_explore",
    "codegraph_impact",
    "codegraph_neighbors",
    "codegraph_path",
    "grep",
  ],
};

function main() {
  const args = parseArgs(process.argv);
  const questionIds =
    args.cohort === "deep-rfc" ? loadDeepRfcIds() : [];
  const manifest = {
    suite: "agent-loop-freeze",
    status: args.dryRun ? "scheduled-dry-run" : "scaffold-needs-mcp",
    freeze: "2026-10-15",
    track: "B",
    design: "benchmarks/pageindex-ab/design/agent-loop-freeze.md",
    corpus: args.corpus,
    cohort: args.cohort,
    n: questionIds.length,
    question_ids: questionIds,
    model: args.model,
    arms: args.arms.map((id) => ({
      id,
      tools: ARM_TOOLS[id] || [],
      setup: id === "A-pageindex" ? ["pageindex_build_tree"] : [],
    })),
    decision:
      "Keep pageindex_* / codegraph_* only if they beat A-grep on graded unique jobs (n+interval).",
    parallel_with: [
      "benchmarks/pageindex-ab/design/vectify-fair-test.md",
      "benchmarks/pageindex-ab/scripts/run_vectify_fair_test.py",
    ],
    has_openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    next: args.dryRun
      ? "Schedule spend; re-run without --dry-run once MCP tool loop is wired."
      : "Wire ClawQL MCP tool loop (not implemented in this scaffold).",
  };

  fs.mkdirSync(args.out, { recursive: true });
  const outPath = path.join(args.out, "schedule-manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, wrote: outPath, manifest }, null, 2));

  if (!args.dryRun) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          "Live agent-loop tool execution is not wired yet; use --dry-run to register the schedule, or extend this script with MCP execute.",
      }),
    );
    process.exitCode = 3;
  }
}

main();
