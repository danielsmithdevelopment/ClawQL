#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
if (!existsSync(cli)) {
  console.error("openbench-dataset: run `npm run build -w openbench-dataset` first.");
  process.exit(1);
}
await import(pathToFileURL(cli).href);
