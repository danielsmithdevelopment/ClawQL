#!/usr/bin/env node
/**
 * CI guard (audit 10.01): every CLAWQL_*ALLOW*|INSECURE*|UNAUTH* identifier
 * found in the repo must appear in docs/security/secure-defaults.md.
 *
 * Run: npm run check:secure-defaults
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const docPath = join(root, "docs/security/secure-defaults.md");

if (!existsSync(docPath)) {
  console.error("Missing docs/security/secure-defaults.md");
  process.exit(1);
}

const doc = readFileSync(docPath, "utf8");

const rg = spawnSync(
  "rg",
  [
    "-o",
    "--no-filename",
    "--no-heading",
    "-N",
    "CLAWQL_[A-Z0-9_]*(?:ALLOW|INSECURE|UNAUTH)[A-Z0-9_]*",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.git/**",
    "--glob",
    "!**/dist/**",
    "--glob",
    "!**/.next/**",
    "--glob",
    "!**/coverage/**",
    "--glob",
    "!docs/security/secure-defaults.md",
    "--glob",
    "!scripts/check-secure-defaults.mjs",
    ".",
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
);

if (rg.error) {
  console.error("Failed to run ripgrep (rg):", rg.error.message);
  process.exit(1);
}

if (rg.status !== 0 && rg.status !== 1) {
  // status 1 = no matches; other non-zero = error
  console.error(rg.stderr || `rg exited ${rg.status}`);
  process.exit(rg.status ?? 1);
}

const found = new Set(
  (rg.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
);

const missing = [...found].filter((name) => !doc.includes(name)).sort();

if (missing.length) {
  console.error(
    "check:secure-defaults failed — identifiers missing from docs/security/secure-defaults.md:\n"
  );
  for (const name of missing) console.error(`  - ${name}`);
  console.error(
    "\nAdd a row (or mention) for each escape hatch. See audit 10.01 / docs/security/secure-defaults.md."
  );
  process.exit(1);
}

console.log(
  `check:secure-defaults ok — ${found.size} CLAWQL_*ALLOW*|INSECURE*|UNAUTH* identifier(s) documented.`
);
