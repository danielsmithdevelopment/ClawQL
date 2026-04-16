/**
 * memory_ingest MCP tool — writes Obsidian-compatible Markdown under the vault.
 */

import { createHash } from "node:crypto";
import { getObsidianVaultPath } from "./vault-config.js";
import {
  readVaultTextFile,
  withVaultWriteLock,
  writeVaultTextFileAtomic,
} from "./vault-utils.js";
import { logMcpToolShape } from "./mcp-tool-log.js";

const MEMORY_DIR = "Memory";

export type MemoryIngestInput = {
  title: string;
  insights?: string;
  conversation?: string;
  toolOutputs?: string | string[];
  wikilinks?: string[];
  sessionId?: string;
  /** When true (default), append a new section to an existing page; duplicate payloads are skipped. */
  append?: boolean;
};

export type MemoryIngestResult = {
  ok: boolean;
  path?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export function slugifyTitle(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
  return s || "note";
}

function normalizeWikilink(name: string): string {
  const t = name.trim();
  const m = t.match(/^\[\[(.+)\]\]$/);
  return (m ? m[1] : t).trim();
}

function formatToolOutputs(toolOutputs: string | string[] | undefined): string {
  if (toolOutputs === undefined) return "";
  if (Array.isArray(toolOutputs)) {
    return toolOutputs.map((s) => s.trim()).filter(Boolean).join("\n\n---\n\n");
  }
  return toolOutputs.trim();
}

function sectionPayload(input: MemoryIngestInput): string {
  const toolText = formatToolOutputs(input.toolOutputs);
  return [input.insights?.trim() ?? "", toolText, input.conversation?.trim() ?? ""].join(
    "\n\u0000\n"
  );
}

export function hashIngestSection(input: MemoryIngestInput): string {
  const h = createHash("sha256");
  h.update(sectionPayload(input), "utf8");
  return h.digest("hex");
}

export function extractIngestHashes(markdown: string): Set<string> {
  const set = new Set<string>();
  const re = /<!--\s*clawql-hash:([a-f0-9]{64})\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    set.add(m[1]);
  }
  return set;
}

function buildSectionBody(input: MemoryIngestInput, when: string): string {
  const lines: string[] = [];
  lines.push(`### Ingestion (${when})`);
  if (input.sessionId?.trim()) {
    lines.push(`_Session:_ \`${input.sessionId.trim().replace(/`/g, "'")}\``);
    lines.push("");
  }
  if (input.insights?.trim()) {
    lines.push("#### Insights");
    lines.push(input.insights.trim());
    lines.push("");
  }
  const toolText = formatToolOutputs(input.toolOutputs);
  if (toolText) {
    lines.push("#### Tool outputs");
    lines.push("```text");
    lines.push(toolText);
    lines.push("```");
    lines.push("");
  }
  if (input.conversation?.trim()) {
    lines.push("#### Conversation");
    lines.push("```text");
    lines.push(input.conversation.trim());
    lines.push("```");
    lines.push("");
  }
  const hash = hashIngestSection(input);
  lines.push(`<!-- clawql-hash:${hash} -->`);
  return lines.join("\n");
}

function buildRelatedLinks(wikilinks: string[] | undefined): string {
  if (!wikilinks?.length) return "";
  const items = wikilinks.map((w) => `- [[${normalizeWikilink(w)}]]`).join("\n");
  return `## Related\n\n${items}\n\n`;
}

function buildFrontmatter(title: string): string {
  const iso = new Date().toISOString();
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${iso}`,
    "tags: [clawql-ingest]",
    "clawql_ingest: true",
    "---",
    "",
  ].join("\n");
}

export async function runMemoryIngest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
  const vault = getObsidianVaultPath();
  if (!vault) {
    return {
      ok: false,
      error:
        "Obsidian vault is not configured. Set CLAWQL_OBSIDIAN_VAULT_PATH to a writable directory.",
    };
  }

  const title = input.title?.trim();
  if (!title) {
    return { ok: false, error: "title is required" };
  }

  const slug = slugifyTitle(title);
  const rel = `${MEMORY_DIR}/${slug}.md`;
  const append = input.append !== false;
  const hash = hashIngestSection(input);
  const when = new Date().toISOString();

  const result = await withVaultWriteLock(vault, async () => {
    let existing = "";
    try {
      existing = await readVaultTextFile(vault, rel);
    } catch {
      existing = "";
    }

    if (existing && extractIngestHashes(existing).has(hash)) {
      return {
        ok: true,
        path: rel,
        skipped: true,
        reason: "Identical ingest payload was already stored (content hash match).",
      };
    }

    const section = buildSectionBody(input, when);
    const related = buildRelatedLinks(input.wikilinks);

    if (!existing) {
      const body = [
        buildFrontmatter(title),
        `# ${title}`,
        "",
        related,
        "---",
        "",
        section,
        "",
      ].join("\n");
      await writeVaultTextFileAtomic(vault, rel, body);
      return { ok: true, path: rel };
    }

    if (!append) {
      const body = [
        buildFrontmatter(title),
        `# ${title}`,
        "",
        related,
        "---",
        "",
        section,
        "",
      ].join("\n");
      await writeVaultTextFileAtomic(vault, rel, body);
      return { ok: true, path: rel };
    }

    const next = `${existing.trimEnd()}\n\n---\n\n${section}\n`;
    await writeVaultTextFileAtomic(vault, rel, next);
    return { ok: true, path: rel };
  });

  if (result.ok && !result.skipped) {
    try {
      const { syncMemoryDbForVaultScanRoot } = await import("./memory-db.js");
      await syncMemoryDbForVaultScanRoot(vault);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[clawql-mcp] memory.db sync after ingest failed: ${msg}`);
    }
    try {
      const { updateProviderIndexPage } = await import("./memory-provider-index.js");
      await updateProviderIndexPage(vault);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[clawql-mcp] provider index update after ingest failed: ${msg}`);
    }
  }

  return result;
}

export async function handleMemoryIngestToolInput(
  params: MemoryIngestInput
): Promise<{ content: { type: "text"; text: string }[] }> {
  logMcpToolShape("memory_ingest", {
    titleChars: params.title?.length ?? 0,
    append: params.append,
    hasInsights: Boolean(params.insights?.trim()),
    hasConversation: Boolean(params.conversation?.trim()),
    hasToolOutputs: Boolean(
      typeof params.toolOutputs === "string"
        ? params.toolOutputs.trim()
        : params.toolOutputs?.some((s) => s.trim())
    ),
    wikilinkCount: params.wikilinks?.length ?? 0,
    hasSessionId: Boolean(params.sessionId?.trim()),
  });
  const result = await runMemoryIngest(params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
