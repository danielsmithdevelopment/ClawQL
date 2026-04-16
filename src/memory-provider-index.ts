/**
 * Auto-generated vault index pages — `_INDEX_{Provider}.md` under the recall scan root (GitHub #38).
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readVaultTextFile, writeVaultTextFileAtomic } from "./vault-utils.js";
import { listVaultMarkdownRelPaths } from "./memory-slug-index.js";
import { stripVaultFrontmatter } from "./vault-markdown.js";

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function isIndexPagePath(rel: string): boolean {
  const b = basename(rel);
  return b.startsWith("_INDEX_") && b.toLowerCase().endsWith(".md");
}

function noteTitleFromMarkdown(rel: string, text: string): string {
  const body = stripVaultFrontmatter(text);
  const hm = body.match(/^\s*#\s+(.+)$/m);
  if (hm) return hm[1].trim();
  return basename(rel, ".md").replace(/-/g, " ");
}

/** Avoid `]]`, `|`, and nested `[` in Obsidian wikilink display text. */
function safeWikilinkDisplay(title: string): string {
  const t = title.trim() || "Untitled";
  return t.replace(/\[\[/g, "").replace(/\]\]/g, "").replace(/\|/g, "—").trim();
}

function indexFingerprint(rows: { rel: string; title: string }[]): string {
  const h = createHash("sha256");
  for (const r of rows) {
    h.update(r.rel, "utf8");
    h.update("\0", "utf8");
    h.update(r.title, "utf8");
    h.update("\n", "utf8");
  }
  return h.digest("hex");
}

const INDEX_FP_RE = /<!--\s*clawql-index:([a-f0-9]{64})\s*-->/;

function fingerprintFromExisting(markdown: string): string | null {
  const m = markdown.match(INDEX_FP_RE);
  return m ? m[1]! : null;
}

function indexFileRel(scanRoot: string, providerLabel: string): string {
  const t = providerLabel.trim() || "ClawQL";
  const safe = t.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  const name = `_INDEX_${safe || "ClawQL"}.md`;
  const root = scanRoot.replace(/\\/g, "/").replace(/^\/+/, "");
  return root ? `${root}/${name}` : name;
}

/**
 * After a successful ingest + DB sync, rewrite the provider index page if needed.
 * Skips when **`CLAWQL_MEMORY_INDEX_PAGE=0`**. Idempotent: no write when content unchanged.
 */
export async function updateProviderIndexPage(vaultRoot: string): Promise<void> {
  if (process.env.CLAWQL_MEMORY_INDEX_PAGE?.trim() === "0") return;

  const scanRoot = defaultScanRoot();
  const maxFiles = envInt("CLAWQL_MEMORY_RECALL_MAX_FILES", 2000);
  const rawLabel = process.env.CLAWQL_MEMORY_INDEX_PROVIDER?.trim();
  const providerLabel = rawLabel && rawLabel.length > 0 ? rawLabel : "ClawQL";

  let paths: string[];
  try {
    paths = await listVaultMarkdownRelPaths(vaultRoot, scanRoot, maxFiles);
  } catch {
    return;
  }

  const indexRel = indexFileRel(scanRoot, providerLabel);
  const notePaths = paths
    .filter((p) => !isIndexPagePath(p))
    .filter((p) => p !== indexRel);

  type Row = { rel: string; title: string };
  const rows: Row[] = [];
  for (const rel of notePaths) {
    try {
      const text = await readVaultTextFile(vaultRoot, rel);
      rows.push({ rel, title: noteTitleFromMarkdown(rel, text) });
    } catch {
      /* skip */
    }
  }

  rows.sort((a, b) => a.title.localeCompare(b.title, "en"));

  const fp = indexFingerprint(rows);
  try {
    const existing = await readVaultTextFile(vaultRoot, indexRel);
    if (fingerprintFromExisting(existing) === fp) return;
  } catch {
    /* missing */
  }

  const scanDisplay = scanRoot === "" ? "(vault root)" : `\`${scanRoot}/\``;
  const lines: string[] = [];
  lines.push("---");
  lines.push("clawql_generated: provider_index");
  lines.push("---");
  lines.push("");
  lines.push(`# Index — ${providerLabel}`);
  lines.push("");
  lines.push(
    `Auto-generated list of Markdown notes under the recall subtree ${scanDisplay}. Updated after **successful \`memory_ingest\`** (when this feature is enabled). Disable with \`CLAWQL_MEMORY_INDEX_PAGE=0\`.`
  );
  lines.push("");
  lines.push(`## Notes (${rows.length})`);
  lines.push("");
  if (rows.length === 0) {
    lines.push("_No notes yet in this subtree._");
    lines.push("");
  } else {
    for (const r of rows) {
      lines.push(`- [[${safeWikilinkDisplay(r.title)}]]`);
    }
    lines.push("");
  }
  lines.push(`<!-- clawql-index:${fp} -->`);
  lines.push("");

  const body = lines.join("\n");

  try {
    await writeVaultTextFileAtomic(vaultRoot, indexRel, body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] provider index page write failed: ${msg}`);
  }
}
