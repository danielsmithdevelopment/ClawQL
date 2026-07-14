/**
 * memory_ingest MCP tool — writes Obsidian-compatible Markdown under the vault.
 */

import { createHash } from "node:crypto";
import {
  formatEnterpriseCitationsMarkdownBlock,
  normalizeEnterpriseCitations,
  stableEnterpriseCitationsPayload,
  type EnterpriseCitation,
} from "./enterprise-citations.js";
import { readToolOutputsFileForIngest } from "../ingest-file.js";
import { slugifyTitle } from "./slug.js";
import { extractIngestHashes } from "./hashes.js";
import { readVaultTextFile, withVaultWriteLock, writeVaultTextFileAtomic } from "../vault/utils.js";
import { presidioRedactMemoryIngestInput } from "./presidio-ingest.js";

export { slugifyTitle, extractIngestHashes };
export type { EnterpriseCitation } from "./enterprise-citations.js";

const MEMORY_DIR = "Memory";

export type MemoryIngestInput = {
  title: string;
  insights?: string;
  conversation?: string;
  /**
   * Short structured citations (e.g. from Onyx) stored in the vault section without full corpora (#130).
   * Prefer passing a trimmed list; values are normalized and capped server-side.
   */
  enterpriseCitations?: EnterpriseCitation[];
  toolOutputs?: string | string[];
  /**
   * When set, the server reads UTF-8 from this path and uses it as `toolOutputs` (avoids huge MCP JSON). Path may be
   * absolute or relative to `process.cwd()`. Must fall under `CLAWQL_MEMORY_INGEST_FILE_ROOTS` (default: realpath of
   * cwd). Disabled when `CLAWQL_MEMORY_INGEST_FILE=0`. If both this and `toolOutputs` are set, the file wins.
   */
  toolOutputsFile?: string;
  wikilinks?: string[];
  sessionId?: string;
  /** When true (default), append a new section to an existing page; duplicate payloads are skipped. */
  append?: boolean;
  /**
   * Post-write derived-index rebuilds (canonical write remains the vault Markdown).
   * - `pageindex`: rebuild PageIndex tree for the written note
   * - `embeddings`: ensure memory.db sync (chunk + embedding refresh) ran; default true when memory.db is on
   */
  rebuild?: {
    pageindex?: boolean;
    embeddings?: boolean;
  };
};

/** Same shape as `memory_recall` / `loadVaultMerkleSnapshotFromDb`. */
export type MerkleSnapshotPayload = {
  rootHex: string;
  leafCount: number;
  treeHeight: number;
  builtAt: string;
};

export type MemoryIngestResult = {
  ok: boolean;
  path?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
  /** When **`CLAWQL_MERKLE_ENABLED=1`**: Merkle row before this ingest’s `memory.db` sync (`null` if no row yet). */
  merkleSnapshotBefore?: MerkleSnapshotPayload | null;
  /** When **`CLAWQL_MERKLE_ENABLED=1`**: Merkle row after sync (vault index fingerprint). */
  merkleSnapshot?: MerkleSnapshotPayload | null;
  /** When Merkle is enabled and comparable: whether **`rootHex`** changed across sync. */
  merkleRootChanged?: boolean;
  /** When **`CLAWQL_CUCKOO_ENABLED=1`** and **`memory.db`** sync ran: membership filter was rebuilt for chunk ids. */
  cuckooMembershipReady?: boolean;
  /** Derived-index rebuild outcomes when requested. */
  rebuild?: {
    pageindex?: { docId: string; nodeCount: number } | { error: string };
    embeddings?: { synced: boolean; skipped?: string };
  };
};

function normalizeWikilink(name: string): string {
  const t = name.trim();
  const m = t.match(/^\[\[(.+)\]\]$/);
  return (m ? m[1] : t).trim();
}

function formatToolOutputs(toolOutputs: string | string[] | undefined): string {
  if (toolOutputs === undefined) return "";
  if (Array.isArray(toolOutputs)) {
    return toolOutputs
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");
  }
  return toolOutputs.trim();
}

function sectionPayload(input: MemoryIngestInput): string {
  const toolText = formatToolOutputs(input.toolOutputs);
  return [
    input.insights?.trim() ?? "",
    stableEnterpriseCitationsPayload(input.enterpriseCitations),
    toolText,
    input.conversation?.trim() ?? "",
  ].join("\n\u0000\n");
}

export function hashIngestSection(input: MemoryIngestInput): string {
  const h = createHash("sha256");
  h.update(sectionPayload(input), "utf8");
  return h.digest("hex");
}

function buildSectionBody(
  input: MemoryIngestInput,
  when: string,
  options?: { toolOutputsReadFromFile?: string }
): string {
  const hash = hashIngestSection(input);
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
  if (input.enterpriseCitations?.length) {
    lines.push(formatEnterpriseCitationsMarkdownBlock(input.enterpriseCitations));
  }
  if (options?.toolOutputsReadFromFile?.trim()) {
    lines.push(
      `*Tool outputs were read on the server from* \`${options.toolOutputsReadFromFile.trim().replace(/`/g, "'")}\`.`
    );
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
  lines.push("#### Provenance");
  lines.push(
    `- **Tool:** \`memory_ingest\` · **UTC:** \`${when}\`${input.sessionId?.trim() ? ` · **session:** \`${input.sessionId.trim().replace(/`/g, "'")}\`` : ""}`
  );
  lines.push(
    `- **Section fingerprint:** SHA-256 \`${hash.slice(0, 16)}…\` (canonical hash in the HTML comment below).`
  );
  lines.push("");
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
    `clawql_ingest_created: ${JSON.stringify(iso)}`,
    "---",
    "",
  ].join("\n");
}

/** Public async facade for vault ingest (MCP tools, scripts, automation). */
export async function runMemoryIngest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
  const { runMemoryEffect, memoryIngestProgram } =
    await import("../effect/memory-effect-runtime.js");
  return runMemoryEffect(memoryIngestProgram(input));
}

/** @deprecated Prefer {@link runMemoryIngest} — routes through Effect services. */
export async function executeMemoryIngest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
  return runMemoryIngest(input);
}

/** Vault write + index sync body (vault path already resolved). */
export async function executeMemoryIngestCore(
  vault: string,
  input: MemoryIngestInput
): Promise<MemoryIngestResult> {
  const title = input.title?.trim();
  if (!title) {
    return { ok: false, error: "title is required" };
  }

  let effective: MemoryIngestInput = { ...input };
  let fileProvenance: string | undefined;
  if (input.toolOutputsFile?.trim()) {
    const r = await readToolOutputsFileForIngest(input.toolOutputsFile.trim());
    if (!r.ok) {
      return { ok: false, error: r.error };
    }
    fileProvenance = r.displayPath;
    effective = {
      ...input,
      toolOutputs: r.text,
      toolOutputsFile: undefined,
    };
  }

  effective = {
    ...effective,
    enterpriseCitations: normalizeEnterpriseCitations(effective.enterpriseCitations),
  };

  effective = await presidioRedactMemoryIngestInput(effective);

  const slug = slugifyTitle(title);
  const rel = `${MEMORY_DIR}/${slug}.md`;
  const append = effective.append !== false;
  const hash = hashIngestSection(effective);
  const when = new Date().toISOString();

  const result = await withVaultWriteLock(vault, async () => {
    let existing = "";
    try {
      existing = await readVaultTextFile(vault, rel);
    } catch {
      // missing file → keep existing as ""
    }

    if (existing && extractIngestHashes(existing).has(hash)) {
      return {
        ok: true,
        path: rel,
        skipped: true,
        reason: "Identical ingest payload was already stored (content hash match).",
      };
    }

    const section = buildSectionBody(effective, when, {
      toolOutputsReadFromFile: fileProvenance,
    });
    const related = buildRelatedLinks(effective.wikilinks);

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
    const { runMemoryEffect } = await import("../effect/memory-effect-runtime.js");
    const { memoryIngestPostSyncExtrasEffect, vaultProviderIndexEffect } =
      await import("../effect/memory-vault-post-sync-effect.js");

    const wantEmbeddings =
      effective.rebuild?.embeddings !== false &&
      (effective.rebuild?.embeddings === true || process.env.CLAWQL_MEMORY_DB?.trim() !== "0");
    const wantPageIndex =
      effective.rebuild?.pageindex === true ||
      process.env.CLAWQL_MEMORY_INGEST_REBUILD_PAGEINDEX?.trim() === "1";

    const rebuild: NonNullable<MemoryIngestResult["rebuild"]> = {};

    if (wantEmbeddings) {
      const indexExtras = await runMemoryEffect(memoryIngestPostSyncExtrasEffect(vault));
      Object.assign(result, indexExtras);
      rebuild.embeddings = { synced: true };
    } else if (effective.rebuild?.embeddings === false) {
      rebuild.embeddings = {
        synced: false,
        skipped: "rebuild.embeddings=false; memory.db / embedding sync skipped",
      };
    }

    await runMemoryEffect(vaultProviderIndexEffect(vault));

    if (wantPageIndex && result.path) {
      try {
        const { pageindexBuildFromVaultPath } = await import("../recall/pageindex-recall.js");
        const docId = result.path.replace(/^Memory\//, "").replace(/\.md$/i, "");
        const built = await pageindexBuildFromVaultPath({
          docId,
          vaultRelativePath: result.path,
        });
        rebuild.pageindex = built;
      } catch (e) {
        rebuild.pageindex = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    const { runAfterIngestVaultSync } = await import("../sync/vault-sync-hooks.js");
    await runAfterIngestVaultSync();
    return {
      ...result,
      rebuild: Object.keys(rebuild).length > 0 ? rebuild : undefined,
    };
  }

  return result;
}
