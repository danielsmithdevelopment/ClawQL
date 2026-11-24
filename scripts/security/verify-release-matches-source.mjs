#!/usr/bin/env node
/**
 * Release-matches-source gate for npm packs.
 *
 * Unpacks each .tgz and asserts every shipped file (except package.json) is
 * byte-identical to the corresponding file in the workspace after build.
 * package.json is compared after applying the same workspace:* pin transform
 * as scripts/release/prepack-clawql-mcp.mjs (root) or left as-is for packages
 * that do not rewrite on pack.
 *
 * Usage:
 *   node scripts/security/verify-release-matches-source.mjs <pack-dir>
 *
 * Env:
 *   CLAWQL_PACK_DIR — alternate pack dir when argv omitted
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

const ALWAYS_SHIPPED = new Set(["package.json", "package-lock.json"]);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function walkFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkFiles(abs, base, out);
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

function resolveWorkspaceVersion(name) {
  const candidates = [
    join(root, "packages", name, "package.json"),
    name === "clawql-mcp" ? join(root, "package.json") : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).version;
  }
  throw new Error(`resolveWorkspaceVersion: no package.json for ${name}`);
}

/** Mirror npm pack / prepack: rewrite workspace:* (and workspace: ranges) to concrete versions. */
function pinWorkspacePackageJson(rawPkg, packageName) {
  const orderPath = join(root, "scripts/release/npm-publish-order.json");
  const { packages: publishOrder } = JSON.parse(readFileSync(orderPath, "utf8"));
  const pkg = structuredClone(rawPkg);
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
    if (!pkg[field]) continue;
    const deps = { ...pkg[field] };
    for (const [name, spec] of Object.entries(deps)) {
      const s = String(spec);
      if (!s.startsWith("workspace:")) continue;
      deps[name] = resolveWorkspaceVersion(name);
    }
    pkg[field] = deps;
  }
  if (packageName === "clawql-mcp") {
    if (process.env.CLAWQL_NPM_BUNDLE_WORKSPACE === "1") {
      pkg.bundledDependencies = publishOrder.filter((n) => n !== "clawql-mcp");
    } else if (pkg.bundledDependencies) {
      delete pkg.bundledDependencies;
    }
  }
  return pkg;
}

function workspaceRootForPackageName(name) {
  if (name === "clawql-mcp") return root;
  const inPackages = join(root, "packages", name);
  if (existsSync(join(inPackages, "package.json"))) return inPackages;
  throw new Error(`Cannot map package ${name} to a workspace path`);
}

function packageNameFromTarball(file) {
  // clawql-mcp-8.0.0.tgz → clawql-mcp; clawql-mcp-events-0.1.0.tgz → clawql-mcp-events
  const base = file.replace(/\.tgz$/, "");
  const m = base.match(/^(.*)-(\d+\.\d+\.\d+.*)$/);
  if (!m) throw new Error(`Cannot parse package name from tarball ${file}`);
  return m[1];
}

function unpack(tarball, dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", dest], { stdio: "pipe" });
  const pkgRoot = join(dest, "package");
  if (!existsSync(pkgRoot)) {
    throw new Error(`Tarball ${tarball} missing package/ root`);
  }
  return pkgRoot;
}

const tarballs = readdirSync(packDir)
  .filter((f) => f.endsWith(".tgz"))
  .sort();

if (tarballs.length === 0) {
  console.error(`verify-release-matches-source: no .tgz files in ${packDir}`);
  process.exit(1);
}

const tmpBase = mkdtempSync(join(tmpdir(), "clawql-rms-"));
let failures = 0;
let compared = 0;

try {
  for (const tarName of tarballs) {
    const tarball = join(packDir, tarName);
    const name = packageNameFromTarball(tarName);
    const wsRoot = workspaceRootForPackageName(name);
    const unpackDir = join(tmpBase, tarName.replace(/\.tgz$/, ""));
    const pkgRoot = unpack(tarball, unpackDir);
    const shipped = walkFiles(pkgRoot);
    let pkgFailures = 0;

    console.log(`\n== ${tarName} (${shipped.length} files) ==`);

    for (const rel of shipped) {
      const packedAbs = join(pkgRoot, rel);
      const packedBuf = readFileSync(packedAbs);

      if (rel === "package.json") {
        const packedPkg = JSON.parse(packedBuf.toString("utf8"));
        const wsPkg = JSON.parse(readFileSync(join(wsRoot, "package.json"), "utf8"));
        const expected = pinWorkspacePackageJson(wsPkg, name);
        // Compare release identity fields (npm may reorder / drop scripts, etc.).
        const pick = (p) =>
          JSON.stringify({
            name: p.name,
            version: p.version,
            main: p.main,
            exports: p.exports,
            bin: p.bin,
            files: p.files,
            dependencies: p.dependencies,
            peerDependencies: p.peerDependencies,
            optionalDependencies: p.optionalDependencies,
            bundledDependencies: p.bundledDependencies,
          });
        if (pick(packedPkg) !== pick(expected)) {
          console.error(`  FAIL package.json identity mismatch for ${name}`);
          console.error(
            `    packed deps sample: ${JSON.stringify(packedPkg.dependencies)?.slice(0, 160)}`,
          );
          failures += 1;
          pkgFailures += 1;
        } else {
          compared += 1;
        }
        continue;
      }

      if (ALWAYS_SHIPPED.has(rel) && rel !== "package.json") {
        // package-lock rarely ships; if present, require match
        const wsAbs = join(wsRoot, rel);
        if (!existsSync(wsAbs)) {
          console.error(`  FAIL unexpected ${rel} in pack (not on disk)`);
          failures += 1;
          pkgFailures += 1;
          continue;
        }
      }

      const wsAbs = join(wsRoot, rel);
      if (!existsSync(wsAbs)) {
        console.error(`  FAIL ${rel}: present in tarball but missing in workspace ${wsRoot}`);
        failures += 1;
        pkgFailures += 1;
        continue;
      }
      const wsBuf = readFileSync(wsAbs);
      const ph = sha256(packedBuf);
      const wh = sha256(wsBuf);
      if (ph !== wh) {
        console.error(`  FAIL ${rel}: sha256 pack=${ph.slice(0, 12)}… workspace=${wh.slice(0, 12)}…`);
        failures += 1;
        pkgFailures += 1;
        continue;
      }
      compared += 1;
    }
    if (pkgFailures === 0) {
      console.log(`  ok: ${name} file digests match workspace`);
    }
  }
} finally {
  rmSync(tmpBase, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nverify-release-matches-source: ${failures} mismatch(es), ${compared} file(s) ok`);
  process.exit(1);
}

console.log(`\nverify-release-matches-source: ${compared} file(s) matched across ${tarballs.length} tarball(s)`);
