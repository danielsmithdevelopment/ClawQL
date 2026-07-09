/**
 * Read/write ~/.ClawQL/sources.json (or $CLAWQL_HOME/sources.json).
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  emptyCustomSourcesFile,
  type CustomSourceEntry,
  type CustomSourcesFile,
} from "./custom-sources-types.js";

const FILE_MODE = 0o600;

export function resolveClawqlHome(): string {
  const raw = process.env.CLAWQL_HOME?.trim();
  if (raw) return resolve(raw);
  return resolve(homedir(), ".ClawQL");
}

export function getCustomSourcesFilePath(home = resolveClawqlHome()): string {
  return join(home, "sources.json");
}

export function getCustomSourceCacheDir(id: string, home = resolveClawqlHome()): string {
  return join(home, "sources", id);
}

export async function readCustomSourcesFile(
  home = resolveClawqlHome()
): Promise<CustomSourcesFile> {
  const path = getCustomSourcesFilePath(home);
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyCustomSourcesFile();
    }
    const o = parsed as Partial<CustomSourcesFile>;
    const sources = Array.isArray(o.sources) ? o.sources : [];
    return {
      version: 1,
      sources: sources.filter(isCustomSourceEntry),
    };
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return emptyCustomSourcesFile();
    throw e;
  }
}

function isCustomSourceEntry(v: unknown): v is CustomSourceEntry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.kind === "string" &&
    typeof o.addedAt === "string"
  );
}

export async function writeCustomSourcesFile(
  file: CustomSourcesFile,
  home = resolveClawqlHome()
): Promise<string> {
  const path = getCustomSourcesFilePath(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: "utf8",
    mode: FILE_MODE,
  });
  await chmod(path, FILE_MODE);
  return path;
}

export async function upsertCustomSource(
  entry: CustomSourceEntry,
  home = resolveClawqlHome()
): Promise<{ path: string; entry: CustomSourceEntry }> {
  const file = await readCustomSourcesFile(home);
  const idx = file.sources.findIndex((s) => s.id === entry.id);
  if (idx >= 0) file.sources[idx] = entry;
  else file.sources.push(entry);
  const path = await writeCustomSourcesFile(file, home);
  return { path, entry };
}

export async function removeCustomSource(id: string, home = resolveClawqlHome()): Promise<boolean> {
  const file = await readCustomSourcesFile(home);
  const next = file.sources.filter((s) => s.id !== id);
  if (next.length === file.sources.length) return false;
  await writeCustomSourcesFile({ version: 1, sources: next }, home);
  return true;
}

export async function ensureSourceCacheDir(
  id: string,
  home = resolveClawqlHome()
): Promise<string> {
  const dir = getCustomSourceCacheDir(id, home);
  await mkdir(dir, { recursive: true });
  return dir;
}
