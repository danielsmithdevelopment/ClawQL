#!/usr/bin/env node
/**
 * Post-publish gate: download each packed package@version from the npm registry
 * and compare SHA-256 of the registry tarball to the local pack we just uploaded.
 *
 * Catches tampering between CI upload and what clients install (including a
 * version replaced after publication).
 *
 * Usage:
 *   node scripts/security/verify-npm-registry-matches-pack.mjs <pack-dir>
 *
 * Env:
 *   CLAWQL_REGISTRY_VERIFY_DELAY_MS — wait before fetch (default 5000; npm CDN lag)
 *   CLAWQL_REGISTRY_VERIFY_RETRIES — retries per package (default 8)
 *   NPM_CONFIG_REGISTRY — override registry (default https://registry.npmjs.org)
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const packDir = resolve(process.argv[2] || process.env.CLAWQL_PACK_DIR || "");
const registry = (process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org").replace(
  /\/$/,
  "",
);
const delayMs = Number(process.env.CLAWQL_REGISTRY_VERIFY_DELAY_MS ?? 5000);
const retries = Number(process.env.CLAWQL_REGISTRY_VERIFY_RETRIES ?? 8);

if (!packDir || !statSync(packDir).isDirectory()) {
  console.error(
    "Usage: node scripts/security/verify-npm-registry-matches-pack.mjs <pack-dir>",
  );
  process.exit(2);
}

function packageNameFromTarball(file) {
  const base = file.replace(/\.tgz$/, "");
  const m = base.match(/^(.*)-(\d+\.\d+\.\d+.*)$/);
  if (!m) throw new Error(`Cannot parse package name from tarball ${file}`);
  return { name: m[1], version: m[2] };
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRegistryTarball(name, version) {
  const metaUrl = `${registry}/${encodeURIComponent(name).replace(/%40/g, "@")}/${version}`;
  const metaRes = await fetch(metaUrl, {
    headers: { accept: "application/json" },
  });
  if (!metaRes.ok) {
    const err = new Error(`registry metadata HTTP ${metaRes.status} for ${name}@${version}`);
    err.status = metaRes.status;
    throw err;
  }
  const meta = await metaRes.json();
  const tarballUrl = meta.dist?.tarball;
  const integrity = meta.dist?.integrity;
  if (!tarballUrl) throw new Error(`no dist.tarball for ${name}@${version}`);
  const tarRes = await fetch(tarballUrl);
  if (!tarRes.ok) {
    const err = new Error(`tarball HTTP ${tarRes.status} for ${tarballUrl}`);
    err.status = tarRes.status;
    throw err;
  }
  const buf = Buffer.from(await tarRes.arrayBuffer());
  return { buf, integrity, tarballUrl };
}

const tarballs = readdirSync(packDir)
  .filter((f) => f.endsWith(".tgz"))
  .sort();

if (!tarballs.length) {
  console.error(`verify-npm-registry-matches-pack: no .tgz in ${packDir}`);
  process.exit(1);
}

console.log(
  `Registry verify: ${tarballs.length} pack(s) against ${registry} (delay=${delayMs}ms retries=${retries})`,
);
await sleep(delayMs);

const report = [];
let failures = 0;
const dlDir = mkdtempSync(join(tmpdir(), "clawql-reg-"));

try {
  for (const tarName of tarballs) {
    const { name, version } = packageNameFromTarball(tarName);
    const localPath = join(packDir, tarName);
    const localHash = sha256(readFileSync(localPath));
    let lastErr = null;
    let ok = false;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { buf, integrity, tarballUrl } = await fetchRegistryTarball(name, version);
        const remoteHash = sha256(buf);
        const match = remoteHash === localHash;
        const row = {
          name,
          version,
          localSha256: localHash,
          registrySha256: remoteHash,
          match,
          integrity,
          tarballUrl,
          attempt,
        };
        report.push(row);
        if (!match) {
          console.error(
            `FAIL ${name}@${version}: local=${localHash.slice(0, 16)}… registry=${remoteHash.slice(0, 16)}…`,
          );
          failures += 1;
        } else {
          console.log(`ok ${name}@${version} sha256=${localHash.slice(0, 16)}… (attempt ${attempt})`);
        }
        writeFileSync(join(dlDir, tarName), buf);
        ok = true;
        break;
      } catch (e) {
        lastErr = e;
        const status = e.status ?? 0;
        console.warn(
          `retry ${name}@${version} attempt ${attempt}/${retries}: ${e.message}`,
        );
        if (status === 404 || status === 409 || status >= 500 || status === 0) {
          await sleep(Math.min(15000, 1000 * attempt));
          continue;
        }
        break;
      }
    }

    if (!ok) {
      const status = lastErr?.status;
      const allowMissing = process.env.CLAWQL_REGISTRY_VERIFY_ALLOW_MISSING !== "0";
      if (allowMissing && (status === 404 || /HTTP 404/.test(String(lastErr?.message)))) {
        console.warn(
          `SKIP ${name}@${version}: not on registry yet (soft-fail publish / first link) — ${lastErr?.message}`,
        );
        report.push({
          name,
          version,
          localSha256: localHash,
          match: null,
          skipped: true,
          error: String(lastErr?.message ?? lastErr),
        });
      } else {
        console.error(
          `FAIL ${name}@${version}: could not fetch from registry — ${lastErr?.message}`,
        );
        failures += 1;
        report.push({
          name,
          version,
          localSha256: localHash,
          match: false,
          error: String(lastErr?.message ?? lastErr),
        });
      }
    }
  }
} finally {
  const keep = process.env.CLAWQL_REGISTRY_VERIFY_REPORT;
  if (keep) {
    mkdirSync(dirname(resolve(keep)), { recursive: true });
    writeFileSync(
      resolve(keep),
      `${JSON.stringify({ schema: "clawql-registry-verify/v1", registry, report }, null, 2)}\n`,
    );
    console.log(`Wrote report ${keep}`);
  }
  rmSync(dlDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`verify-npm-registry-matches-pack: ${failures} failure(s)`);
  process.exit(1);
}

console.log(`verify-npm-registry-matches-pack: all ${tarballs.length} pack(s) match registry`);
void root;
