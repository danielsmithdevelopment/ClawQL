/**
 * Memory-backed VaultSeedPort — plugin vaultSeed entries become ordinary tagged vault notes.
 * Provided by clawql-memory so clawql-core stays free of memory imports.
 */

import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { VaultSeedPort, type VaultSeedEntry } from "clawql-core";
import { getObsidianVaultPath } from "../vault/config.js";
import { listVaultMarkdownRelPaths } from "../vault/slug-index.js";
import { runMemoryIngest } from "../ingest/ingest.js";

export function pluginVaultSeedTag(pluginId: string): string {
  return `clawql-plugin:${pluginId}`;
}

function parseFrontmatterTags(text: string): string[] {
  if (!text.startsWith("---")) return [];
  const end = text.indexOf("\n---", 3);
  if (end < 0) return [];
  const fm = text.slice(3, end);
  const tagsLine = fm.match(/^tags:\s*\[([^\]]*)\]/m) ?? fm.match(/^tags:\s*\n((?:\s*-\s*.+\n)+)/m);
  if (!tagsLine) return [];
  if (tagsLine[1]?.includes("-")) {
    return tagsLine[1]
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean);
  }
  return tagsLine[1]
    .split(",")
    .map((s) => s.replace(/['"]/g, "").trim())
    .filter(Boolean);
}

/**
 * Schedule best-effort vault IO without introducing Async fibers.
 * `createClawQLApi` installs plugins via `Effect.runSync`; `Effect.tryPromise` there
 * raises AsyncFiberException and aborts MCP/Docker startup when a vault path is set.
 */
function scheduleBestEffort(work: () => Promise<void>): Effect.Effect<void, never> {
  return Effect.sync(() => {
    void work().catch(() => undefined);
  });
}

async function ingestTaggedAsync(
  pluginId: string,
  entries: readonly VaultSeedEntry[]
): Promise<void> {
  if (!getObsidianVaultPath()) return;
  const tag = pluginVaultSeedTag(pluginId);
  for (const entry of entries) {
    await runMemoryIngest({
      title: entry.title,
      insights: entry.content,
      type: entry.ontologyType,
      tags: [tag, "clawql-vault-seed"],
      append: false,
    });
  }
}

async function deleteByPluginTagAsync(pluginId: string): Promise<void> {
  const vault = getObsidianVaultPath();
  if (!vault) return;
  const tag = pluginVaultSeedTag(pluginId);
  const rels = await listVaultMarkdownRelPaths(vault, "Memory", 5000);
  for (const rel of rels) {
    const { readFile } = await import("node:fs/promises");
    let text: string;
    try {
      text = await readFile(join(vault, rel), "utf8");
    } catch {
      continue;
    }
    const tags = parseFrontmatterTags(text);
    if (!tags.includes(tag)) continue;
    await unlink(join(vault, rel)).catch(() => undefined);
  }
}

/**
 * Live vault seed: ingest tagged notes; uninstall deletes notes carrying the plugin tag.
 * No-ops when vault path is unset (same posture as memory tools without vault).
 *
 * IO is best-effort and deferred so sync composition roots stay runSync-safe.
 */
export const MemoryVaultSeedLive: Layer.Layer<VaultSeedPort> = Layer.succeed(VaultSeedPort, {
  ingestTagged: (pluginId, entries: readonly VaultSeedEntry[]) =>
    scheduleBestEffort(() => ingestTaggedAsync(pluginId, entries)),

  deleteByPluginTag: (pluginId) => scheduleBestEffort(() => deleteByPluginTagAsync(pluginId)),
});
