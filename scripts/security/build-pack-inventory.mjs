#!/usr/bin/env node
/**
 * Build a release bill-of-materials for packed npm tarballs:
 * name, version, bytes, sha256, and a sorted content-id of paths+digests inside each pack.
 *
 * Usage:
 *   node scripts/security/build-pack-inventory.mjs <pack-dir> [out.json]
 */
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const packDir = resolve(process.argv[2] || process.env.CLAWQL_PACK_DIR || "");
const outPath = resolve(
  process.argv[3] ||
    process.env.CLAWQL_PACK_INVENTORY_OUT ||
    join(packDir || root, "pack-inventory.json"),
);

if (!packDir || !statSync(packDir).isDirectory()) {
  console.error("Usage: node scripts/security/build-pack-inventory.mjs <pack-dir> [out.json]");
  process.exit(2);
}

function packageNameFromTarball(file) {
  const base = file.replace(/\.tgz$/, "");
  const m = base.match(/^(.*)-(\d+\.\d+\.\d+.*)$/);
  if (!m) throw new Error(`Cannot parse package name from tarball ${file}`);
  return { name: m[1], version: m[2] };
}

function walkFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkFiles(abs, base, out);
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const tarballs = readdirSync(packDir)
  .filter((f) => f.endsWith(".tgz"))
  .sort();

if (!tarballs.length) {
  console.error(`build-pack-inventory: no .tgz in ${packDir}`);
  process.exit(1);
}

const tmpBase = mkdtempSync(join(tmpdir(), "clawql-inv-"));
const packages = [];

try {
  for (const tarName of tarballs) {
    const tarball = join(packDir, tarName);
    const { name, version } = packageNameFromTarball(tarName);
    const buf = readFileSync(tarball);
    const unpackDir = join(tmpBase, tarName.replace(/\.tgz$/, ""));
    mkdirSync(unpackDir, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", unpackDir], { stdio: "pipe" });
    const pkgRoot = join(unpackDir, "package");
    const files = walkFiles(pkgRoot).sort();
    const lines = [];
    for (const rel of files) {
      lines.push(`${rel}=${sha256(readFileSync(join(pkgRoot, rel)))}`);
    }
    const contentId = sha256(Buffer.from(lines.join("\n"), "utf8"));
    packages.push({
      name,
      version,
      file: tarName,
      bytes: buf.length,
      sha256: sha256(buf),
      fileCount: files.length,
      contentId,
    });
  }
} finally {
  rmSync(tmpBase, { recursive: true, force: true });
}

const inventory = {
  schema: "clawql-pack-inventory/v1",
  generatedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || process.env.CLAWQL_GIT_SHA || null,
  packageCount: packages.length,
  packages,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`build-pack-inventory: wrote ${outPath} (${packages.length} packages)`);
