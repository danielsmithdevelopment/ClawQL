#!/usr/bin/env node
/** Read canonical Harvey LAB stack metadata (JSON on stdout). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(readFileSync(join(root, "stack-version.json"), "utf8"));

if (process.argv.includes("--export-shell")) {
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "string") {
      const envKey = `CLAWQL_LAB_${k.toUpperCase().replace(/-/g, "_")}`;
      console.log(`export ${envKey}=${JSON.stringify(v)}`);
    }
  }
  console.log(`export CLAWQL_LAB_STACK_VERSION=${JSON.stringify(meta.stack_version)}`);
} else {
  process.stdout.write(JSON.stringify(meta, null, 2));
}
