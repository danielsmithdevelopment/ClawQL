#!/usr/bin/env node
/**
 * Offline tool-level check: A-grep search roots can see no-harm gold files.
 * Does not call OpenRouter. Exit 0 only if every no-harm key's gold path appears
 * in ripgrep hits for a symbol extracted from the question / answer.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepoRoot, runTool } from "./agent_loop_tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = resolveRepoRoot(__dirname);

function main() {
  const noHarm = JSON.parse(
    fs.readFileSync(path.join(ROOT, "design", "codegraph-no-harm-keys.json"), "utf8")
  );
  const rows = [];
  let ok = 0;
  for (const key of noHarm.keys || []) {
    const gold = String(key.normalized_answer || "").replace(/\\/g, "/");
    // Prefer an identifier from accepted variants / question backticks
    const fromQ = String(key.question || "").match(/`([^`]+)`/);
    const pattern =
      (key.gold?.symbol || key.symbol || (fromQ && fromQ[1]) || "").trim() ||
      gold.split("/").pop()?.replace(/\.\w+$/, "") ||
      "";
    const out = runTool("grep", { pattern, max_matches: 40 }, { repoRoot: REPO, doc: null });
    const hit =
      !out.startsWith("error:") &&
      !out.startsWith("(no matches") &&
      (out.includes(gold) || out.includes(gold.replace(/\.ts$/, ".js")));
    if (hit) ok++;
    rows.push({
      id: key.id,
      pattern,
      gold,
      hit,
      out_head: out.slice(0, 240),
    });
  }
  const report = {
    ok: ok === (noHarm.keys || []).length,
    repoRoot: REPO,
    n: (noHarm.keys || []).length,
    hits: ok,
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 2;
}

main();
