#!/usr/bin/env node
/**
 * CI gate: clawql-audit must not depend on any ClawQL package except clawql-merkle.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const all = {
  ...pkg.dependencies,
  ...pkg.peerDependencies,
  ...pkg.optionalDependencies,
};
const forbidden = Object.keys(all).filter(
  (name) => name.startsWith("clawql-") && name !== "clawql-merkle"
);
if (forbidden.length) {
  console.error("clawql-audit forbidden ClawQL dependencies:", forbidden.join(", "));
  process.exit(1);
}
if (!all["clawql-merkle"]) {
  console.error("clawql-audit must depend on clawql-merkle");
  process.exit(1);
}
console.log("clawql-audit dependency gate OK (clawql-merkle only)");
