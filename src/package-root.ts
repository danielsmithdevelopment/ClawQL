import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Directory containing package.json (works when running from dist/ or src/).
 */
export function getPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const base = basename(here);
  if (base === "dist" || base === "src") {
    return join(here, "..");
  }
  return here;
}
