/**
 * Measure Expo export bundle sizes (web / ios / android JS artifacts).
 * These are the closest CI-stable "weight" signal without a device farm.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push({ path: full, bytes: st.size });
  }
  return acc;
}

function summarizeExport(platform, outDir) {
  const files = walkFiles(outDir);
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  const jsFiles = files.filter((f) => /\.(js|hbc|hermes)$/i.test(f.path));
  const jsBytes = jsFiles.reduce((n, f) => n + f.bytes, 0);
  const largest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((f) => ({
    rel: path.relative(outDir, f.path),
    bytes: f.bytes,
    kb: Math.round(f.bytes / 1024),
  }));
  return {
    platform,
    outDir: path.relative(root, outDir),
    fileCount: files.length,
    totalBytes,
    totalKb: Math.round(totalBytes / 1024),
    jsBytes,
    jsKb: Math.round(jsBytes / 1024),
    largest,
  };
}

function exportPlatform(platform, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync(
    "npx",
    ["expo", "export", "--platform", platform, "--output-dir", outDir],
    {
      cwd: root,
      env: { ...process.env, EXPO_PUBLIC_CLAWQL_FIXTURE: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || "").slice(-2000);
    throw new Error(`expo export --platform ${platform} failed:\n${err}`);
  }
  return summarizeExport(platform, outDir);
}

export async function measureBundles({ platforms = ["web", "ios", "android"] } = {}) {
  const results = {};
  for (const platform of platforms) {
    const outDir = path.join(root, `dist-perf-${platform}`);
    console.log(`[perf-bundle] exporting ${platform} → ${path.relative(root, outDir)}`);
    results[platform] = exportPlatform(platform, outDir);
    console.log(
      `[perf-bundle] ${platform}: js=${results[platform].jsKb}KB total=${results[platform].totalKb}KB files=${results[platform].fileCount}`
    );
  }
  return {
    measuredAt: new Date().toISOString(),
    results,
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const data = await measureBundles();
  const out = path.join(root, "perf", "out", "bundle.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  console.log("wrote", out);
}
