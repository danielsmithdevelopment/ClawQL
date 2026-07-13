import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walk upward from `startDir` until the ClawQL monorepo root (`clawql-mcp` + workspaces) is found.
 * Used by dogfood / integration tests so paths work regardless of `process.cwd()`.
 */
export function resolveClawqlRepoRoot(startDir?: string): string {
  let dir = startDir ?? path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          name?: string;
          workspaces?: unknown;
        };
        if (pkg.name === "clawql-mcp" || pkg.workspaces) {
          return dir;
        }
      } catch {
        // keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("ClawQL monorepo root not found (expected package.json with name clawql-mcp)");
}

/** Default scope for fast dogfood runs: memory tier + codegraph engine packages. */
export function defaultDogfoodScope(repoRoot: string): readonly string[] {
  return [
    path.join(repoRoot, "packages/clawql-codegraph"),
    path.join(repoRoot, "packages/clawql-memory"),
  ];
}

/** Full-repo dogfood when CLAWQL_CODEGRAPH_DOGFOOD_FULL=1 (slower; local / nightly). */
export function dogfoodIndexRoots(repoRoot: string): readonly string[] {
  if (envTruthy(process.env.CLAWQL_CODEGRAPH_DOGFOOD_FULL)) {
    return [repoRoot];
  }
  return defaultDogfoodScope(repoRoot);
}

function envTruthy(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

export function dogfoodMaxFiles(): number {
  const v = process.env.CLAWQL_CODEGRAPH_DOGFOOD_MAX_FILES?.trim();
  if (v) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return envTruthy(process.env.CLAWQL_CODEGRAPH_DOGFOOD_FULL) ? 5000 : 350;
}
