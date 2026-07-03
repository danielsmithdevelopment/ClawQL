#!/usr/bin/env node
/** Restore package.json after pack/publish (undo prepack semver pins). */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pkgPath = join(root, "package.json");
const backupPath = join(root, ".package.json.prepack-backup");

if (!existsSync(backupPath)) {
  console.warn("postpack: no prepack backup found, skipping restore");
  process.exit(0);
}

writeFileSync(pkgPath, readFileSync(backupPath, "utf8"));
unlinkSync(backupPath);
console.log("postpack: restored package.json for monorepo dev");
