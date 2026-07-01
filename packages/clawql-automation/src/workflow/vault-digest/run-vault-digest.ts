/**
 * Collect vault notes ingested in the last N hours and ingest one digest note.
 */

import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { stripVaultFrontmatter } from "clawql-memory";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { listVaultMarkdownRelPaths } from "clawql-memory/vault/slug-index";
import { readVaultTextFile } from "clawql-memory/vault/utils";
import { runMemoryIngest } from "clawql-memory/ingest/ingest";

export const DIGEST_TAG = "clawql-digest";
export const MEMORY_DIR = "Memory";

export type VaultDigestSource = {
  path: string;
  title: string;
  ingested_at: string;
  excerpt: string;
};

export type RunVaultDailyDigestInput = {
  /** Hours to look back (default 24). */
  hoursBack?: number;
  /** Override vault path (default CLAWQL_OBSIDIAN_VAULT_PATH). */
  vaultPath?: string;
  /** Digest note title prefix (default "Vault digest"). */
  titlePrefix?: string;
  /** Max source notes to include (default 200). */
  maxSources?: number;
};

export type RunVaultDailyDigestResult = {
  ok: boolean;
  sourceCount: number;
  digestPath?: string;
  digestTitle?: string;
  sources?: VaultDigestSource[];
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type Frontmatter = {
  title?: string;
  tags?: string[];
  clawql_ingest_created?: string;
  clawql_ingest?: boolean;
};

function parseFrontmatter(text: string): Frontmatter {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return {};
  const block = text.slice(4, end);
  const out: Frontmatter = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!;
    let raw = m[2]!.trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        raw = JSON.parse(raw) as string;
      } catch {
        raw = raw.slice(1, -1);
      }
    }
    if (key === "title") out.title = raw;
    if (key === "clawql_ingest_created") out.clawql_ingest_created = raw;
    if (key === "clawql_ingest") out.clawql_ingest = raw === "true";
    if (key === "tags") {
      const tagMatch = raw.match(/^\[(.*)\]$/);
      if (tagMatch) {
        out.tags = tagMatch[1]!
          .split(",")
          .map((t) => t.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      }
    }
  }
  return out;
}

function extractTitle(text: string, path: string): string {
  const fm = parseFrontmatter(text);
  if (fm.title?.trim()) return fm.title.trim();
  const body = stripVaultFrontmatter(text);
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return basename(path, ".md");
}

function extractInsightsExcerpt(text: string, maxLen = 1200): string {
  const body = stripVaultFrontmatter(text);
  const marker = "#### Insights";
  const idx = body.indexOf(marker);
  if (idx === -1) {
    const trimmed = body.replace(/\s+/g, " ").trim();
    return trimmed.slice(0, maxLen);
  }
  const after = body.slice(idx + marker.length);
  const nextHeading = after.search(/\n#{1,4} /);
  const section = (nextHeading === -1 ? after : after.slice(0, nextHeading)).trim();
  return section.slice(0, maxLen);
}

function isDigestNote(fm: Frontmatter, title: string, titlePrefix: string): boolean {
  if (fm.tags?.includes(DIGEST_TAG)) return true;
  if (title.toLowerCase().startsWith(titlePrefix.toLowerCase())) return true;
  return false;
}

async function noteTimestampMs(
  vaultAbs: string,
  relPath: string,
  text: string
): Promise<number | null> {
  const fm = parseFrontmatter(text);
  if (fm.clawql_ingest_created) {
    const t = Date.parse(fm.clawql_ingest_created);
    if (Number.isFinite(t)) return t;
  }
  try {
    const st = await stat(join(vaultAbs, relPath));
    return st.mtimeMs;
  } catch {
    return null;
  }
}

function utcDateLabel(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function buildDigestInsights(
  windowStart: Date,
  windowEnd: Date,
  sources: VaultDigestSource[]
): string {
  const lines: string[] = [
    `Rolling digest of **${sources.length}** ingested note(s) from the last 24 hours.`,
    "",
    `- **Window start (UTC):** \`${windowStart.toISOString()}\``,
    `- **Window end (UTC):** \`${windowEnd.toISOString()}\``,
    "",
    "## Sources",
    "",
  ];
  for (const s of sources) {
    lines.push(`### [[${s.title}]]`);
    lines.push("");
    lines.push(`- **Path:** \`${s.path}\``);
    lines.push(`- **Ingested:** \`${s.ingested_at}\``);
    lines.push("");
    if (s.excerpt.trim()) {
      lines.push(s.excerpt.trim());
      lines.push("");
    }
  }
  lines.push("## Summary");
  lines.push("");
  if (sources.length === 0) {
    lines.push("_No ingested notes in the window._");
  } else {
    const titles = sources.map((s) => `[[${s.title}]]`).join(", ");
    lines.push(
      `This digest rolls up ${sources.length} note(s): ${titles}. Each section above quotes the **Insights** portion (or body excerpt) from the source note.`
    );
  }
  return lines.join("\n");
}

export async function runVaultDailyDigest(
  input: RunVaultDailyDigestInput = {}
): Promise<RunVaultDailyDigestResult> {
  const vaultAbs = input.vaultPath?.trim() || getObsidianVaultPath();
  if (!vaultAbs) {
    return {
      ok: false,
      sourceCount: 0,
      error:
        "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.",
    };
  }

  const hoursBack = input.hoursBack ?? 24;
  const titlePrefix = input.titlePrefix?.trim() || "Vault digest";
  const maxSources = input.maxSources ?? 200;
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hoursBack * 60 * 60 * 1000);
  const cutoffMs = windowStart.getTime();

  const paths = await listVaultMarkdownRelPaths(vaultAbs, MEMORY_DIR, 10_000);
  const sources: VaultDigestSource[] = [];

  for (const rel of paths) {
    if (sources.length >= maxSources) break;
    let text: string;
    try {
      text = await readVaultTextFile(vaultAbs, rel);
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text);
    const title = extractTitle(text, rel);
    if (isDigestNote(fm, title, titlePrefix)) continue;

    const ts = await noteTimestampMs(vaultAbs, rel, text);
    if (ts === null || ts < cutoffMs) continue;

    sources.push({
      path: rel,
      title,
      ingested_at: new Date(ts).toISOString(),
      excerpt: extractInsightsExcerpt(text),
    });
  }

  sources.sort((a, b) => a.ingested_at.localeCompare(b.ingested_at));

  if (sources.length === 0) {
    return {
      ok: true,
      sourceCount: 0,
      skipped: true,
      reason: `No ingested notes in Memory/ within the last ${hoursBack} hours`,
      sources: [],
    };
  }

  const digestTitle = `${titlePrefix} — ${utcDateLabel(windowEnd)}`;
  const insights = buildDigestInsights(windowStart, windowEnd, sources);
  const ingest = await runMemoryIngest({
    title: digestTitle,
    insights,
    wikilinks: sources.map((s) => s.title),
    sessionId: `vault-digest-${utcDateLabel(windowEnd)}`,
    append: true,
  });

  if (!ingest.ok) {
    return {
      ok: false,
      sourceCount: sources.length,
      sources,
      error: ingest.error ?? "memory_ingest failed",
    };
  }

  return {
    ok: true,
    sourceCount: sources.length,
    digestPath: ingest.path,
    digestTitle,
    sources,
  };
}
