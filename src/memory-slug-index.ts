/**
 * Vault-relative Markdown listing + slug → path map (same rules as memory_recall).
 */

import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { slugifyTitle } from "./memory-ingest.js";
import { stripVaultFrontmatter } from "./vault-markdown.js";

export async function listVaultMarkdownRelPaths(
  vaultAbs: string,
  subRel: string,
  maxFiles: number
): Promise<string[]> {
  const out: string[] = [];
  async function walk(rel: string): Promise<void> {
    if (out.length >= maxFiles) return;
    const abs = join(vaultAbs, rel);
    const entries = await readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (e.name.startsWith(".")) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(nextRel);
      } else if (e.isFile() && extname(e.name).toLowerCase() === ".md") {
        out.push(nextRel.replace(/\\/g, "/"));
      }
    }
  }
  await walk(subRel.replace(/\\/g, "/").replace(/^\/+/, ""));
  return out;
}

export function buildSlugToVaultPath(files: { path: string; text: string }[]): Map<string, string> {
  const slugToPath = new Map<string, string>();
  for (const f of files) {
    const s = slugifyTitle(basename(f.path, ".md"));
    if (!slugToPath.has(s)) slugToPath.set(s, f.path);
    const h = stripVaultFrontmatter(f.text);
    const hm = h.match(/^#\s+(.+)$/m);
    if (hm) {
      const hs = slugifyTitle(hm[1].trim());
      if (!slugToPath.has(hs)) slugToPath.set(hs, f.path);
    }
  }
  return slugToPath;
}
