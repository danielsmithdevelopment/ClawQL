#!/usr/bin/env node
/**
 * Bundle-size + stray-file budget for packed npm artifacts.
 *
 * Usage:
 *   node scripts/security/check-bundle-budgets.mjs <pack-dir>
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const packDir = resolve(
  process.argv[2] || process.env.CLAWQL_PACK_DIR || join(root, ".pack-workspace"),
);
const budgets = JSON.parse(
  readFileSync(join(root, "scripts/security/bundle-budgets.json"), "utf8"),
);

function packageNameFromTarball(file) {
  const base = file.replace(/\.tgz$/, "");
  const m = base.match(/^(.*)-(\d+\.\d+\.\d+.*)$/);
  if (!m) throw new Error(`Cannot parse package name from tarball ${file}`);
  return m[1];
}

function maxBytesFor(name) {
  const exact = budgets.tarballs[name];
  if (exact?.maxBytes) return exact.maxBytes;
  if (name.startsWith("clawql-") && budgets.tarballs["clawql-*"]?.maxBytes) {
    return budgets.tarballs["clawql-*"].maxBytes;
  }
  return budgets.tarballs["clawql-*"]?.maxBytes ?? 15 * 1024 * 1024;
}

function walkFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkFiles(abs, base, out);
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

function isAllowedBasename(base) {
  return (budgets.allowBasenames ?? []).includes(base);
}

function isForbiddenPath(rel) {
  const base = rel.split("/").pop() ?? rel;
  if (isAllowedBasename(base)) return false;
  if ((budgets.forbidBasenames ?? []).includes(base)) return true;
  const lower = base.toLowerCase();
  if (lower.startsWith(".env") && lower !== ".env.example") return true;
  for (const ext of budgets.forbidExtensions ?? []) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

const tarballs = readdirSync(packDir)
  .filter((f) => f.endsWith(".tgz"))
  .sort();

if (tarballs.length === 0) {
  console.error(`check-bundle-budgets: no .tgz files in ${packDir}`);
  process.exit(1);
}

const tmpBase = mkdtempSync(join(tmpdir(), "clawql-budget-"));
let failures = 0;

try {
  for (const tarName of tarballs) {
    const tarball = join(packDir, tarName);
    const name = packageNameFromTarball(tarName);
    const size = statSync(tarball).size;
    const limit = maxBytesFor(name);
    const sha = createHash("sha256").update(readFileSync(tarball)).digest("hex");

    console.log(`\n== ${tarName} ==`);
    console.log(`  size=${size} max=${limit} sha256=${sha.slice(0, 16)}…`);

    if (size > limit) {
      console.error(`  FAIL size ${size} exceeds budget ${limit}`);
      failures += 1;
    }

    const unpackDir = join(tmpBase, name);
    mkdirSync(unpackDir, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", unpackDir], { stdio: "pipe" });
    const pkgRoot = join(unpackDir, "package");
    if (!existsSync(pkgRoot)) {
      console.error(`  FAIL missing package/ in tarball`);
      failures += 1;
      continue;
    }

    const files = walkFiles(pkgRoot);
    let mapCount = 0;
    const forbidMaps =
      process.env.CLAWQL_FORBID_SOURCE_MAPS === "1" ||
      budgets.sourceMaps?.forbidInProductionPacks === true;
    for (const rel of files) {
      if (isForbiddenPath(rel)) {
        console.error(`  FAIL forbidden path in pack: ${rel}`);
        failures += 1;
      }
      if (rel.endsWith(".map")) {
        mapCount += 1;
        if (forbidMaps) {
          console.error(`  FAIL source map shipped in production pack: ${rel}`);
          failures += 1;
        }
      }
    }
    if (mapCount > 0 && !forbidMaps) {
      console.log(
        `  warn: ${mapCount} source map(s) in pack (set CLAWQL_FORBID_SOURCE_MAPS=1 to fail)`,
      );
    }
    console.log(`  ok: ${files.length} paths checked`);
  }
} finally {
  rmSync(tmpBase, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\ncheck-bundle-budgets: ${failures} failure(s)`);
  process.exit(1);
}

console.log(`\ncheck-bundle-budgets: ${tarballs.length} tarball(s) within budget`);
