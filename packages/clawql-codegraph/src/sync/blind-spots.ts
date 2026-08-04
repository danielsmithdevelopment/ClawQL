import fs from "node:fs/promises";
import path from "node:path";
import type { CodeGraphDocument } from "../types.js";

/** Extensions the native ClawQL indexer can extract today. */
export const NATIVE_CODEGRAPH_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
]);

/** Broader set used when measuring Graphify coverage vs the repo tree. */
const COVERAGE_EXTENSIONS = new Set([
  ...NATIVE_CODEGRAPH_EXTENSIONS,
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".rb",
  ".php",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".scala",
  ".sql",
  ".tf",
  ".hcl",
  ".proto",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".toml",
  ".json",
]);

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
  "graphify-out",
]);

export type ExtensionCoverage = {
  readonly extension: string;
  readonly repoFiles: number;
  readonly graphFiles: number;
  /** 0–1 share of repo files that appear in the imported graph. */
  readonly coverage: number;
  readonly nativeIndexable: boolean;
};

export type BlindSpotReport = {
  readonly byExtension: readonly ExtensionCoverage[];
  /** Extensions with repo files but zero (or below-threshold) graph coverage. */
  readonly blindSpots: readonly ExtensionCoverage[];
  /** Blind spots the native indexer can fill. */
  readonly nativeFillable: readonly ExtensionCoverage[];
};

/**
 * Compare repo file extensions against `source_file` / `filePath` coverage in an imported graph.
 * An extension is a blind spot when coverage is below `minCoverage` (default 0).
 */
export async function detectBlindSpots(
  rootPath: string,
  doc: CodeGraphDocument,
  options: { minCoverage?: number; maxFiles?: number } = {}
): Promise<BlindSpotReport> {
  const minCoverage = options.minCoverage ?? 0;
  const maxFiles = options.maxFiles ?? 20_000;
  const repoCounts = await countRepoExtensions(rootPath, maxFiles);
  const graphCounts = countGraphExtensions(doc);

  const extensions = new Set([...repoCounts.keys(), ...graphCounts.keys()]);
  const byExtension: ExtensionCoverage[] = [];
  for (const extension of [...extensions].sort()) {
    const repoFiles = repoCounts.get(extension) ?? 0;
    const graphFiles = graphCounts.get(extension) ?? 0;
    if (repoFiles === 0 && graphFiles === 0) continue;
    const coverage = repoFiles === 0 ? 1 : Math.min(1, graphFiles / repoFiles);
    byExtension.push({
      extension,
      repoFiles,
      graphFiles,
      coverage,
      nativeIndexable: NATIVE_CODEGRAPH_EXTENSIONS.has(extension),
    });
  }

  const blindSpots = byExtension.filter(
    (row) => row.repoFiles > 0 && row.coverage <= minCoverage
  );
  const nativeFillable = blindSpots.filter((row) => row.nativeIndexable);
  return { byExtension, blindSpots, nativeFillable };
}

function countGraphExtensions(doc: CodeGraphDocument): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const node of Object.values(doc.nodes)) {
    const fp = node.filePath?.trim();
    if (!fp) continue;
    const key = fp.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const ext = path.extname(fp).toLowerCase();
    if (!ext || !COVERAGE_EXTENSIONS.has(ext)) continue;
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return counts;
}

async function countRepoExtensions(
  rootPath: string,
  maxFiles: number
): Promise<Map<string, number>> {
  const absRoot = path.resolve(rootPath);
  const counts = new Map<string, number>();
  let visited = 0;

  async function walk(dir: string): Promise<void> {
    if (visited >= maxFiles) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= maxFiles) break;
      if (DEFAULT_IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!COVERAGE_EXTENSIONS.has(ext)) continue;
        visited += 1;
        counts.set(ext, (counts.get(ext) ?? 0) + 1);
      }
    }
  }

  await walk(absRoot);
  return counts;
}
