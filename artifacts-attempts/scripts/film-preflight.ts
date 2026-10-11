#!/usr/bin/env npx tsx
/**
 * Pre-recording checklist (fast). Does not replace demo:record-prep.
 *
 *   npm run demo:film-preflight
 *   PREFLIGHT_RUN=1 npm run demo:film-preflight   # also runs judge-smoke
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "LICENSE",
  "README.md",
  "DAY1.md",
  "docs/JUDGE_RUNBOOK.md",
  "docs/ARCHITECTURE.md",
  "docs/VIDEO_SCRIPT.md",
  "docs/SUBMISSION.md",
  "docs/STATUS.md",
  "docs/STANDALONE.md",
  "docs/FAQ.md",
  "docs/HUMAN_NEXT.md",
  "agents/run-attempt.sh",
  "demo/fixtures/patches/att_1.good.patch",
  "demo/fixtures/patches/att_2.partial.patch",
  "demo/fixtures/patches/att_3.blocked.patch",
  "package-lock.json",
  "scripts/judge-smoke.ts",
  "scripts/demo-gate.ts",
  "scripts/hydrate-from.ts",
  "workers/api/public/index.html",
  "workers/api/public/approve.html",
];

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error("film-preflight FAIL — missing:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const needScripts = [
  "demo:local",
  "demo:judge-smoke",
  "demo:gate",
  "demo:record-prep",
  "demo:board-mcp-smoke",
  "demo:film-preflight",
  "board:serve",
  "board:hydrate",
  "board:hydrate-from",
];
const missingScripts = needScripts.filter((s) => !pkg.scripts?.[s]);
if (missingScripts.length) {
  console.error("film-preflight FAIL — missing npm scripts: " + missingScripts.join(", "));
  process.exit(1);
}

console.log("film-preflight: tree + scripts OK");

if (process.env.PREFLIGHT_RUN === "1") {
  console.log("film-preflight: running demo:judge-smoke…");
  execFileSync("npm", ["run", "demo:judge-smoke"], { cwd: root, stdio: "inherit" });
}

console.log(`
FILM PREFLIGHT PASS

Next for recording:
  1. npm run demo:record-prep     # GATE PASS required
  2. npm run board:serve
  3. npm run board:hydrate-from   # after a demo snapshot exists
  4. Follow docs/VIDEO_SCRIPT.md
  5. Submit per docs/SUBMISSION.md + docs/STATUS.md
`);
