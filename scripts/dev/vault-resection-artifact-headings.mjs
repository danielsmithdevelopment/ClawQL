#!/usr/bin/env node
/**
 * One-time / ops helper: find (and optionally demote) ATX headings that are
 * TOC leader-dot lines or numbered list/procedure steps.
 *
 * Product `splitMarkdownSections` already skips these at read time (8.0+),
 * so read_around section IDs are clean without rewriting files. Demoting the
 * lines in vault Markdown removes ghosts from the source and from any
 * heading-aware tooling that does not use the filter.
 *
 * Usage:
 *   node scripts/dev/vault-resection-artifact-headings.mjs --vault ~/.ClawQL/Memory --dry-run
 *   node scripts/dev/vault-resection-artifact-headings.mjs --vault ~/.ClawQL/Memory --write
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

/** Keep in sync with packages/clawql-memory/src/recall/read-around.ts */
function isArtifactHeadingTitle(title) {
  const t = title.trim();
  if (!t) return true;
  if (/\.\s+\.\s+\./.test(t) || /\.{3,}/.test(t) || /…/.test(t)) return true;
  if (/\s{2,}\d+\s*$/.test(t) && t.includes(".")) return true;
  const m = /^(\d+(?:\.\d+)*)\s+(.+)$/.exec(t);
  if (m) {
    const rest = m[2];
    if (/^(If|Verify|Create|The|A|An|When|For|Note|Ensure|Confirm|Check)\b/.test(rest)) {
      return true;
    }
  }
  return false;
}

async function* walkMd(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      yield* walkMd(p);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      yield p;
    }
  }
}

function demoteArtifactHeadings(markdown) {
  const headingRe = /^(#{1,6})\s+(.+?)\s*$/;
  const lines = markdown.split(/\r?\n/);
  const hits = [];
  const out = lines.map((line, i) => {
    const m = headingRe.exec(line);
    if (!m) return line;
    const title = m[2].trim();
    if (!isArtifactHeadingTitle(title)) return line;
    hits.push({ line: i + 1, title });
    // Demote to plain text (keep content, drop ATX) so it cannot mint section IDs.
    return title;
  });
  return { text: out.join("\n"), hits };
}

async function main() {
  const args = process.argv.slice(2);
  const vaultIdx = args.indexOf("--vault");
  const vault = vaultIdx >= 0 ? args[vaultIdx + 1] : process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const write = args.includes("--write");

  if (!vault) {
    console.error("Pass --vault <path> or set CLAWQL_OBSIDIAN_VAULT_PATH");
    process.exit(2);
  }

  const st = await stat(vault).catch(() => null);
  if (!st?.isDirectory()) {
    console.error(`Not a directory: ${vault}`);
    process.exit(2);
  }

  const report = { vault, mode: write ? "write" : "dry-run", files: [], totalHits: 0 };

  for await (const file of walkMd(vault)) {
    const raw = await readFile(file, "utf8");
    const { text, hits } = demoteArtifactHeadings(raw);
    if (hits.length === 0) continue;
    report.totalHits += hits.length;
    report.files.push({
      path: relative(vault, file),
      hits: hits.length,
      samples: hits.slice(0, 5),
    });
    if (write) {
      await writeFile(file, text, "utf8");
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.totalHits > 0 && !write) {
    console.error(
      `\n${report.totalHits} artifact heading(s) in ${report.files.length} file(s). Re-run with --write to demote.`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
