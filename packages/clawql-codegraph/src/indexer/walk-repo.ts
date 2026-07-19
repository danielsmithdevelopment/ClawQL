import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".turbo",
  "coverage",
  ".next",
  "target",
  "__pycache__",
  ".venv",
  "venv",
]);

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"]);

export function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function walkCodeFiles(
  rootPath: string,
  options: { maxFiles?: number; ignore?: Set<string> } = {}
): Promise<string[]> {
  const maxFiles = options.maxFiles ?? envInt("CLAWQL_CODEGRAPH_MAX_FILES", 5000);
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const absRoot = path.resolve(rootPath);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) return;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && isCodeFile(full)) {
        results.push(full);
      }
    }
  }

  await walk(absRoot);
  return results;
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export function relPath(absPath: string, rootPath: string): string {
  return path.relative(path.resolve(rootPath), path.resolve(absPath)).replace(/\\/g, "/");
}
