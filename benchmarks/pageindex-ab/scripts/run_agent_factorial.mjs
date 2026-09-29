#!/usr/bin/env node
/**
 * Agent factorial entrypoint for pageindex-ab.
 *
 * Requires OPENROUTER_API_KEY (+ OpenCode / clawql-inference) for live cells.
 * Without a key, exits 2 with a structured blocker report (CI-friendly).
 *
 * Live wiring reuses the OpenBench OpenCode → clawql-inference path documented in
 * benchmarks/openbench/README.md. This script prepares per-arm workspaces and
 * task files; full matrix execution lands when secrets are present.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "results", "agent-factorial");

const ARMS = [
  "H-idf",
  "H-idf-pi",
  "H-bm25",
  "H-bm25-pi",
  "H-idf-cg",
  "H-bm25-cg",
  "H-idf-pi-cg",
  "H-bm25-pi-cg",
];

function main() {
  mkdirSync(OUT, { recursive: true });
  const key = process.env.OPENROUTER_API_KEY || "";
  const corpus = process.env.PAGEINDEX_AB_CORPUS || "freeze-candidate";
  const keysPath =
    corpus === "contaminated-smoke"
      ? join(ROOT, "fixtures", "contaminated-smoke", "pilot-keys.jsonl")
      : join(ROOT, "corpus", "freeze-candidate", "keys.jsonl");

  const blocker = {
    ok: false,
    mode: "agent-factorial",
    corpus,
    model_primary: "openrouter/deepseek/deepseek-chat",
    arms: ARMS,
    blockers: [],
  };

  if (!key) {
    blocker.blockers.push({
      code: "missing_openrouter",
      message: "OPENROUTER_API_KEY is not set; agent factorial cannot call clawql-inference",
    });
  }
  if (!existsSync(keysPath)) {
    blocker.blockers.push({
      code: "missing_keys",
      message: `keys not found at ${keysPath}`,
    });
  }

  // Prepare task stubs even when blocked — proves harness readiness.
  const tasksDir = join(OUT, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  let nKeys = 0;
  if (existsSync(keysPath)) {
    const lines = readFileSync(keysPath, "utf8").split("\n").filter(Boolean);
    nKeys = lines.length;
    const sample = lines.slice(0, 3).map((l) => JSON.parse(l));
    for (const arm of ARMS) {
      const armDir = join(tasksDir, arm);
      mkdirSync(armDir, { recursive: true });
      for (const q of sample) {
        const body = [
          `# pageindex-ab task ${q.id} / ${arm}`,
          "",
          `Answer using only tools allowed for arm ${arm}.`,
          `Budget: 12 tool calls, 180s.`,
          "",
          `Question: ${q.question}`,
          "",
          `Return JSON: {"answer":"...","sections":[],"not_found":false}`,
        ].join("\n");
        writeFileSync(join(armDir, `${q.id}.md`), body);
      }
    }
  }

  const report = {
    ...blocker,
    n_questions: nKeys,
    tasks_prepared: existsSync(tasksDir),
    next_steps: [
      "Export OPENROUTER_API_KEY",
      "Start clawql inference serve",
      "Run OpenCode non-interactive per arm×question (see benchmarks/openbench/README.md)",
      "Grade with scripts/grade_tier1.py + bootstrap_paired.py",
    ],
  };
  writeFileSync(join(OUT, "agent-blocker-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (blocker.blockers.length) process.exit(2);
  // Key present but OpenCode matrix not fully wired yet — exit 3 = partial.
  console.error("OPENROUTER_API_KEY present but OpenCode cell loop not yet wired in this PR.");
  process.exit(3);
}

main();
