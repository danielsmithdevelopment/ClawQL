/**
 * Single source for MCP `Implementation.version` — reads root `package.json` at runtime.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPackageRoot } from "./package-root.js";

function readVersion(): string {
  try {
    const pkgPath = join(getPackageRoot(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const NPM_PACKAGE_VERSION = readVersion();
