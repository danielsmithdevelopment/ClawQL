/**
 * Load `.env` from the package root (next to dist/) and from `process.cwd()`.
 * Cwd wins on duplicate keys so local overrides work.
 * Enables CLAWQL_* in repo `.env` for Cursor MCP without duplicating secrets in mcp.json.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRootEnv = resolve(here, "..", ".env");
if (existsSync(packageRootEnv)) {
  config({ path: packageRootEnv });
}
const cwdEnv = resolve(process.cwd(), ".env");
if (existsSync(cwdEnv)) {
  config({ path: cwdEnv, override: true });
}
