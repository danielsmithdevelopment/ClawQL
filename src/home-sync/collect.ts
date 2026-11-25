import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { Effect } from "effect";
import { ALWAYS_EXCLUDE_PREFIXES, ALWAYS_EXCLUDE_REL } from "./paths.js";
import type { SyncFileEntry } from "./types.js";

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

async function sha256File(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

function toPosixRel(home: string, absPath: string): string {
  return relative(home, absPath).split("\\").join("/");
}

/** True when a relative path must never sync (push or pull). */
export function isExcludedRel(rel: string): boolean {
  const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === "." || ALWAYS_EXCLUDE_REL.has(normalized)) return true;
  if (normalized.includes("..")) return true;
  if (normalized.includes("/.")) return true; // hidden dirs
  for (const prefix of ALWAYS_EXCLUDE_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Resolve a sync relative path under home. Rejects absolute paths, `..`, and
 * anything that escapes the home after normalize (audit 2.07).
 */
export function assertSafeSyncRelPath(home: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error(`Unsafe sync path: ${relPath}`);
  }
  if (normalized.split("/").some((seg) => seg === ".." || seg === "")) {
    throw new Error(`Unsafe sync path: ${relPath}`);
  }
  if (isExcludedRel(normalized)) {
    throw new Error(`Excluded sync path: ${relPath}`);
  }
  const root = resolve(home);
  const abs = resolve(root, normalized);
  if (abs !== root && !abs.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe sync path escapes home: ${relPath}`);
  }
  return abs;
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

/** Collect syncable files under CLAWQL_HOME (Effect-primary). */
export function collectLocalSyncFilesEffect(
  home: string,
  include: string[]
): Effect.Effect<Map<string, SyncFileEntry>, Error> {
  return Effect.tryPromise({
    try: async () => {
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
    },
    catch: asError,
  });
}

/** Promise façade — prefer {@link collectLocalSyncFilesEffect}. */
export async function collectLocalSyncFiles(
  home: string,
  include: string[]
): Promise<Map<string, SyncFileEntry>> {
  return Effect.runPromise(collectLocalSyncFilesEffect(home, include));
}

export function absPathForRel(home: string, relPath: string): string {
  return assertSafeSyncRelPath(home, relPath);
}
