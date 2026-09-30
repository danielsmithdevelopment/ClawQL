#!/usr/bin/env node
/**
 * Score Track B additive spend against codegraph-prove-decision.lock.json.
 *
 * Input: results/agent-loop-freeze/answers.jsonl
 *   { question_id, arm, answer, answer_ok, used_codegraph, codegraph_tools_used }
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOCK = path.join(ROOT, "design", "codegraph-prove-decision.lock.json");

function loadJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function main() {
  const answersPath =
    process.argv[2] || path.join(ROOT, "results", "agent-loop-freeze", "answers.jsonl");
  const outPath =
    process.argv[3] ||
    path.join(ROOT, "results", "agent-loop-freeze", "codegraph-beat-decision.json");
  const lock = JSON.parse(fs.readFileSync(LOCK, "utf8"));
  const prove = new Set(
    (JSON.parse(fs.readFileSync(path.join(ROOT, "design", "codegraph-prove-keys.oracle.json"), "utf8"))
      .keys || []
    ).map((k) => k.id)
  );
  const noHarm = new Set(
    (JSON.parse(fs.readFileSync(path.join(ROOT, "design", "codegraph-no-harm-keys.json"), "utf8"))
      .keys || []
    ).map((k) => k.id)
  );
  const rows = loadJsonl(answersPath);
  const by = new Map(); // qid -> arm -> row
  for (const r of rows) {
    if (!by.has(r.question_id)) by.set(r.question_id, {});
    by.get(r.question_id)[r.arm] = r;
  }

  let W = 0;
  let L = 0;
  let prove_grep_ok = 0;
  let prove_cg_ok = 0;
  let prove_n = 0;
  let no_harm_cg_ok = 0;
  let no_harm_n = 0;
  let used_cg_prove = 0;
  let used_cg_harm = 0;
  const paired = [];

  for (const qid of prove) {
    const arms = by.get(qid) || {};
    const g = arms["A-grep"];
    const t = arms["A-codegraph"];
    if (!g || !t) continue;
    prove_n++;
    const gOk = Boolean(g.answer_ok);
    const tOk = Boolean(t.answer_ok);
    if (gOk) prove_grep_ok++;
    if (tOk) prove_cg_ok++;
    if (t.used_codegraph) used_cg_prove++;
    if (tOk && !gOk) W++;
    if (gOk && !tOk) L++;
    paired.push({ id: qid, cohort: "prove", grep_ok: gOk, treatment_ok: tOk, used_codegraph: Boolean(t.used_codegraph) });
  }
  for (const qid of noHarm) {
    const arms = by.get(qid) || {};
    const t = arms["A-codegraph"];
    if (!t) continue;
    no_harm_n++;
    if (t.answer_ok) no_harm_cg_ok++;
    if (t.used_codegraph) used_cg_harm++;
    paired.push({ id: qid, cohort: "no_harm", treatment_ok: Boolean(t.answer_ok), used_codegraph: Boolean(t.used_codegraph) });
  }

  const net = W - L;
  const no_harm_pass = no_harm_n > 0 && no_harm_cg_ok >= Math.max(0, no_harm_n - 1);
  let outcome = "incomplete";
  if (prove_n >= 12 && no_harm_n >= 6) {
    if (net >= 5 && no_harm_pass) outcome = "codegraph_beats";
    else if (net <= -5) outcome = "grep_beats";
    else outcome = "tie_purge";
  }
  const freeze =
    outcome === "codegraph_beats"
      ? "keep_codegraph_opt_in"
      : outcome === "incomplete"
        ? "blocked_incomplete_spend"
        : "purge_codegraph_from_bundle";

  const report = {
    tag: "pageindex-ab-codegraph-beat-v1",
    lock_status: lock.status,
    answers_path: answersPath,
    prove: { n: prove_n, grep_ok: prove_grep_ok, treatment_ok: prove_cg_ok, W, L, net, used_codegraph: used_cg_prove },
    no_harm: { n: no_harm_n, treatment_ok: no_harm_cg_ok, pass: no_harm_pass, used_codegraph: used_cg_harm },
    outcome,
    freeze,
    decision_rule: lock.beat,
    paired,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = outcome === "incomplete" ? 2 : 0;
}

main();
