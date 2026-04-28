#!/usr/bin/env node
/**
 * Download each Google API Discovery REST document listed in discovery-directory.json
 * (one JSON file per API). This can be **very large** (hundreds of MB total) — use
 * --limit for testing. Output is gitignored by default (discovery-cache/).
 *
 * Usage:
 *   node scripts/providers/fetch-all-google-discovery-specs.mjs
 *   node scripts/providers/fetch-all-google-discovery-specs.mjs --limit=5 --dry-run
 *   node scripts/providers/fetch-all-google-discovery-specs.mjs --only-preferred --delay-ms=150
 *
 * Requires: providers/google/discovery-directory.json (run fetch-google-discovery-directory first).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_DIR = join(root, "providers/google/discovery-directory.json");
const DEFAULT_OUT = join(root, "providers/google/discovery-cache");

function parseArgs(argv) {
  const out = {
    directoryPath: DEFAULT_DIR,
    outDir: DEFAULT_OUT,
    limit: 0,
    delayMs: 100,
    onlyPreferred: false,
    dryRun: false,
  };
  for (const a of argv) {
    if (a.startsWith("--directory="))
      out.directoryPath = join(root, a.slice("--directory=".length));
    else if (a.startsWith("--out-dir="))
      out.outDir = join(root, a.slice("--out-dir=".length));
    else if (a.startsWith("--limit="))
      out.limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    else if (a.startsWith("--delay-ms="))
      out.delayMs = Math.max(0, parseInt(a.slice("--delay-ms=".length), 10) || 0);
    else if (a === "--only-preferred") out.onlyPreferred = true;
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

function safeFilename(id) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "_") + ".json";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const raw = await readFile(opts.directoryPath, "utf-8");
  const data = JSON.parse(raw);
  const items = Array.isArray(data.items) ? data.items : [];
  let list = opts.onlyPreferred ? items.filter((i) => i.preferred) : items;
  if (opts.limit > 0) list = list.slice(0, opts.limit);

  process.stderr.write(
    `Directory: ${opts.directoryPath}\n` +
      `APIs to fetch: ${list.length}${opts.onlyPreferred ? " (preferred only)" : ""}\n` +
      `Output: ${opts.outDir}\n` +
      `Delay: ${opts.delayMs}ms\n`
  );

  if (opts.dryRun) {
    for (const it of list) {
      process.stdout.write(`${it.id}\t${it.discoveryRestUrl}\n`);
    }
    process.stderr.write("Dry run — no files written.\n");
    return;
  }

  await mkdir(opts.outDir, { recursive: true });
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const url = it.discoveryRestUrl;
    if (!url) {
      process.stderr.write(`[skip] ${it.id}: no discoveryRestUrl\n`);
      fail++;
      continue;
    }
    const file = join(opts.outDir, safeFilename(it.id));
    process.stderr.write(`[${i + 1}/${list.length}] ${it.id} … `);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await writeFile(file, text, "utf-8");
      ok++;
      process.stderr.write(`ok → ${safeFilename(it.id)}\n`);
    } catch (e) {
      fail++;
      process.stderr.write(`FAIL: ${e.message}\n`);
    }
    if (opts.delayMs > 0 && i < list.length - 1) await sleep(opts.delayMs);
  }
  process.stderr.write(`Done. ${ok} ok, ${fail} failed/skipped.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
