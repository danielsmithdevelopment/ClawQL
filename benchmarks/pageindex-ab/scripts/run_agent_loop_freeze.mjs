#!/usr/bin/env node
/**
 * Strong-model agent-loop freeze scaffold (Track B).
 *
 * Product question: does adding codegraph_* improve today's default (grep)?
 * Treatment A-codegraph = grep + codegraph_* (additive). Optional diagnostic
 * A-codegraph-only has no grep. See design/codegraph-prove-decision.lock.json.
 *
 * Usage:
 *   node benchmarks/pageindex-ab/scripts/run_agent_loop_freeze.mjs --dry-run \
 *     --cohort codegraph-prove --arms A-no-tools,A-grep,A-codegraph
 *   # optional diagnostic:
 *   #   --arms A-no-tools,A-grep,A-codegraph,A-codegraph-only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCK_PATH = path.join(ROOT, "design", "codegraph-prove-decision.lock.json");

function parseArgs(argv) {
  const out = {
    dryRun: false,
    corpus: "clawql-monorepo",
    cohort: "codegraph-prove",
    arms: ["A-no-tools", "A-grep", "A-codegraph"],
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

function loadCodegraphCohorts() {
  const prove = JSON.parse(
    fs.readFileSync(path.join(ROOT, "design", "codegraph-prove-keys.oracle.json"), "utf8"),
  );
  const noHarm = JSON.parse(
    fs.readFileSync(path.join(ROOT, "design", "codegraph-no-harm-keys.json"), "utf8"),
  );
  return {
    prove_ids: (prove.keys || []).map((k) => k.id),
    no_harm_ids: (noHarm.keys || []).map((k) => k.id),
  };
}

const ARM_TOOLS = {
  "A-no-tools": [],
  "A-grep": ["grep", "read_around"],
  // Treatment (beat arm): additive — today's default PLUS codegraph_*.
  "A-codegraph": [
    "grep",
    "read_around",
    "codegraph_explore",
    "codegraph_impact",
    "codegraph_neighbors",
    "codegraph_path",
    "codegraph_query",
  ],
  // Diagnostic only — "can CodeGraph replace grep?" Never decides freeze.
  "A-codegraph-only": [
    "codegraph_explore",
    "codegraph_impact",
    "codegraph_neighbors",
    "codegraph_path",
    "codegraph_query",
    "read_around",
  ],
  "A-pageindex": [
    "pageindex_traverse",
    "pageindex_get_content",
    "pageindex_synthesize",
    "read_around",
  ],
};

const CODEGRAPH_TOOL_NAMES = [
  "codegraph_explore",
  "codegraph_impact",
  "codegraph_neighbors",
  "codegraph_path",
  "codegraph_query",
  "codegraph_explain",
  "codegraph_subgraph",
  "codegraph_index",
  "codegraph_sync",
];

function main() {
  const args = parseArgs(process.argv);
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));

  let proveIds = [];
  let noHarmIds = [];
  let questionIds = [];
  if (args.cohort === "deep-rfc") {
    questionIds = loadDeepRfcIds();
  } else if (args.cohort === "codegraph-prove") {
    ({ prove_ids: proveIds, no_harm_ids: noHarmIds } = loadCodegraphCohorts());
    questionIds = [...proveIds, ...noHarmIds];
  }

  const requiredArms = ["A-no-tools", "A-grep", "A-codegraph"];
  const missing = requiredArms.filter((a) => !args.arms.includes(a));
  if (args.cohort === "codegraph-prove" && missing.length) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `codegraph-prove cohort requires arms ${requiredArms.join(",")}; missing ${missing.join(",")}`,
      }),
    );
    process.exitCode = 2;
    return;
  }

  // Treatment must include grep (additive). Reject stale CodeGraph-only configs
  // that reuse the A-codegraph id without grep.
  const treatmentTools = ARM_TOOLS["A-codegraph"] || [];
  if (!treatmentTools.includes("grep") || !treatmentTools.some((t) => t.startsWith("codegraph_"))) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "A-codegraph treatment arm must include both grep and codegraph_* tools (additive).",
      }),
    );
    process.exitCode = 2;
    return;
  }

  const manifest = {
    suite: "agent-loop-freeze",
    status: args.dryRun ? "scheduled-dry-run" : "scaffold-needs-mcp",
    freeze: "2026-10-15",
    track: "B",
    product_question: lock.product_question,
    design: "benchmarks/pageindex-ab/design/agent-loop-freeze.md",
    decision_lock: "benchmarks/pageindex-ab/design/codegraph-prove-decision.lock.json",
    decision_lock_status: lock.status,
    clear_to_sign: lock.clear_to_sign === true,
    beat: lock.beat,
    corpus: args.corpus,
    cohort: args.cohort,
    n_prove: proveIds.length || undefined,
    n_no_harm: noHarmIds.length || undefined,
    n: questionIds.length,
    prove_ids: proveIds.length ? proveIds : undefined,
    no_harm_ids: noHarmIds.length ? noHarmIds : undefined,
    question_ids: questionIds,
    model: args.model,
    arms: args.arms.map((id) => ({
      id,
      role:
        id === "A-codegraph"
          ? "treatment"
          : id === "A-grep"
            ? "control"
            : id === "A-codegraph-only"
              ? "diagnostic"
              : id === "A-no-tools"
                ? "baseline"
                : "other",
      tools: ARM_TOOLS[id] || [],
      setup:
        id === "A-codegraph" || id === "A-codegraph-only" ? ["codegraph_sync"] : [],
      counts_toward_net: id === "A-grep" || id === "A-codegraph",
    })),
    usage_evidence: {
      arm: "A-codegraph",
      codegraph_tool_names: CODEGRAPH_TOOL_NAMES,
      record_per_question: [
        "codegraph_tool_calls",
        "codegraph_tools_used",
        "used_codegraph",
      ],
      note: "If treatment has grep+CodeGraph and used_codegraph is usually false, that answers the purpose question on its own.",
    },
    decision:
      "Keep codegraph_* only if Net>=5 (grep+CodeGraph vs grep) AND no-harm pass; tie/no-harm fail => purge. Report usage (used_codegraph) and A-no-tools rates. A-codegraph-only is diagnostic only.",
    parallel_with: [
      "benchmarks/pageindex-ab/design/vectify-fair-test.md",
      "benchmarks/pageindex-ab/design/HUMAN_PASS_ONE_SITTING.md",
    ],
    has_openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    next: args.dryRun
      ? "Human-pass first (HUMAN_PASS_ONE_SITTING.md; clear_to_sign); then live spend once MCP tool loop is wired."
      : "Wire ClawQL MCP tool loop (not implemented in this scaffold). Record used_codegraph per treatment question.",
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
