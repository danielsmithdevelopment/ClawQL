/**
 * Lightweight OKF frontmatter scan for inference export filters.
 * Avoids requiring the full clawql-memory package at runtime when vault is unset.
 */

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { OkfTrustLookup } from "./filter.js";

function parseSimpleFrontmatter(markdown: string): Record<string, unknown> {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = markdown.slice(3, end).trim();
  const out: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentObj: Record<string, unknown> | null = null;
  for (const line of block.split("\n")) {
    const nested = line.match(/^\s{2,}([A-Za-z0-9_]+):\s*(.*)$/);
    if (nested && currentObj) {
      const v = nested[2]!.trim().replace(/^["']|["']$/g, "");
      currentObj[nested[1]!] = v;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (raw === "" || raw === "|" || raw === ">") {
      currentKey = key;
      currentObj = {};
      out[key] = currentObj;
      continue;
    }
    currentKey = null;
    currentObj = null;
    out[key] = raw.replace(/^["']|["']$/g, "");
  }
  void currentKey;
  return out;
}

async function walkMd(
  abs: string,
  rel: string,
  maxFiles: number,
  out: string[]
): Promise<void> {
  if (out.length >= maxFiles) return;
  const entries = await readdir(abs, { withFileTypes: true });
  for (const e of entries) {
    if (out.length >= maxFiles) return;
    if (e.name.startsWith(".")) continue;
    const nextRel = rel ? `${rel}/${e.name}` : e.name;
    const nextAbs = join(abs, e.name);
    if (e.isDirectory()) await walkMd(nextAbs, nextRel, maxFiles, out);
    else if (
      e.isFile() &&
      (extname(e.name).toLowerCase() === ".md" || extname(e.name).toLowerCase() === ".cqk")
    ) {
      out.push(nextRel.replace(/\\/g, "/"));
    }
  }
}

/** Load correlation_id → OKF trust fields from a vault directory. */
export async function loadOkfTrustByCorrelationIdFromVault(
  vaultAbs: string,
  scanRoot = "Memory",
  maxFiles = 50_000
): Promise<OkfTrustLookup> {
  const root = scanRoot.replace(/\\/g, "/").replace(/^\/+/, "");
  const startAbs = root ? join(vaultAbs, root) : vaultAbs;
  const rels: string[] = [];
  try {
    await walkMd(startAbs, root, maxFiles, rels);
  } catch {
    return new Map();
  }
  const map: OkfTrustLookup = new Map();
  for (const rel of rels) {
    const b = rel.split("/").pop()?.toLowerCase() ?? "";
    if (b === "index.md" || b === "log.md" || b.startsWith("_index_")) continue;
    let text: string;
    try {
      text = await readFile(join(vaultAbs, rel), "utf8");
    } catch {
      continue;
    }
    const fm = parseSimpleFrontmatter(text);
    const cid = typeof fm.correlation_id === "string" ? fm.correlation_id.trim() : "";
    if (!cid) continue;
    const verified =
      fm.verified && typeof fm.verified === "object"
        ? (fm.verified as Record<string, unknown>)
        : undefined;
    map.set(cid, {
      path: rel,
      status: typeof fm.status === "string" ? fm.status : undefined,
      verifiedBy: typeof verified?.by === "string" ? verified.by : undefined,
      staleAfter: typeof fm.stale_after === "string" ? fm.stale_after : undefined,
    });
  }
  return map;
}

export function resolveVaultPathForExport(
  vaultPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const fromOpt = vaultPath?.trim();
  if (fromOpt) return fromOpt;
  const fromEnv = env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
  return fromEnv || undefined;
}
