#!/usr/bin/env node
/**
 * Fail if the bundled Worker artifact exceeds the Cloudflare/celld 64 MiB limit.
 * Uses esbuild (same toolchain as celld deploy) — no fleet bucket required.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const WRANGLER_LIMIT = 64 * 1024 * 1024;

function parseJsonc(text) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

function findEsbuild() {
  const fromPath = spawnSync("esbuild", ["--version"], { encoding: "utf8" });
  if (fromPath.status === 0) return "esbuild";
  const fromNpx = spawnSync("npx", ["esbuild", "--version"], { encoding: "utf8" });
  if (fromNpx.status === 0) return "npx esbuild";
  console.error("bundle-check: esbuild not found on PATH");
  process.exit(1);
}

const wranglerPath = join(projectRoot, "wrangler.jsonc");
const wrangler = parseJsonc(readFileSync(wranglerPath, "utf8"));
const entry = join(projectRoot, wrangler.main);
const tmpDir = mkdtempSync(join(tmpdir(), "clawql-streams-celld-"));
const outfile = join(tmpDir, "bundle.js");
const metafile = join(tmpDir, "meta.json");

const esbuildCmd = findEsbuild();
const args =
  esbuildCmd === "esbuild"
    ? [
        entry,
        "--bundle",
        "--format=esm",
        "--platform=browser",
        `--outfile=${outfile}`,
        `--metafile=${metafile}`,
        "--minify",
      ]
    : [
        "esbuild",
        entry,
        "--bundle",
        "--format=esm",
        "--platform=browser",
        `--outfile=${outfile}`,
        `--metafile=${metafile}`,
        "--minify",
      ];

const run = spawnSync(esbuildCmd === "esbuild" ? "esbuild" : "npx", args, {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  process.exit(run.status ?? 1);
}

const bundle = readFileSync(outfile);
const size = bundle.byteLength;
const pct = ((size / WRANGLER_LIMIT) * 100).toFixed(2);

console.log(
  `bundle-check: ${size} bytes (${pct}% of ${WRANGLER_LIMIT} byte Workers limit)`,
);

rmSync(tmpDir, { recursive: true, force: true });

if (size > WRANGLER_LIMIT) {
  console.error(`bundle-check: FAIL — exceeds 64 MiB limit by ${size - WRANGLER_LIMIT} bytes`);
  process.exit(1);
}

console.log("bundle-check: PASS");
