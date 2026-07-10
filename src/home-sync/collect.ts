import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { ALWAYS_EXCLUDE_REL } from "./paths.js";
import type { SyncFileEntry } from "./types.js";

async function sha256File(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

function toPosixRel(home: string, absPath: string): string {
  return relative(home, absPath).split("\\").join("/");
}

function isExcludedRel(rel: string): boolean {
  if (ALWAYS_EXCLUDE_REL.has(rel)) return true;
  if (rel.startsWith("vault/")) return true;
  if (rel.includes("/.")) return true; // hidden dirs
  return false;
}

async function walkFile(
  absPath: string,
  home: string,
  out: Map<string, SyncFileEntry>
): Promise<void> {
  const rel = toPosixRel(home, absPath);
  if (isExcludedRel(rel)) return;
  const st = await stat(absPath);
  if (!st.isFile()) return;
  out.set(rel, {
    sha256: await sha256File(absPath),
    size: st.size,
    mtimeMs: st.mtimeMs,
  });
}

async function walkDir(
  absDir: string,
  home: string,
  out: Map<string, SyncFileEntry>
): Promise<void> {
  const relDir = toPosixRel(home, absDir);
  if (relDir !== "" && isExcludedRel(relDir)) return;
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return;
    throw e;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const abs = join(absDir, ent.name);
    if (ent.isDirectory()) await walkDir(abs, home, out);
    else if (ent.isFile()) await walkFile(abs, home, out);
  }
}

/** Collect syncable files under CLAWQL_HOME. */
export async function collectLocalSyncFiles(
  home: string,
  include: string[]
): Promise<Map<string, SyncFileEntry>> {
  const out = new Map<string, SyncFileEntry>();
  for (const item of include) {
    const rel = item.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || isExcludedRel(rel)) continue;
    const abs = join(home, rel);
    const st = await stat(abs).catch((e: unknown) => {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw e;
    });
    if (!st) continue;
    if (st.isDirectory()) await walkDir(abs, home, out);
    else if (st.isFile()) await walkFile(abs, home, out);
  }
  return out;
}

export function absPathForRel(home: string, relPath: string): string {
  return join(home, relPath);
}
