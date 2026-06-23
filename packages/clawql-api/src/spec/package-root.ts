import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Monorepo root containing `providers/` (clawql-mcp package root).
 * Works when this module lives under `packages/clawql-api/dist/**`.
 */
export function getPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "providers"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("getPackageRoot: could not locate ClawQL repo root (missing providers/)");
}
