#!/usr/bin/env node
/**
 * Stamp versions + clawql commit onto a peer-results JSON file.
 *
 * Usage:
 *   node stamp-peer-version.mjs <peer-results.json> --peer obot [--image ...] [--digest ...]
 *   node stamp-peer-version.mjs <peer-results.json> --peer bifrost [--binary ...]
 *   node stamp-peer-version.mjs <peer-results.json> --peer executor [--version ...]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { clawqlVersionPin, peerVersionPin } from "./versions.mjs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
if (!path) {
  console.error("usage: stamp-peer-version.mjs <file.json> --peer <name> [...]");
  process.exit(2);
}

function opt(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return args[i + 1];
}

const peer = opt("peer");
if (!peer) {
  console.error("--peer required");
  process.exit(2);
}

const detected = {};
for (const key of ["image", "digest", "binary", "version", "package", "label"]) {
  const v = opt(key);
  if (v !== undefined) detected[key] = v;
}

const row = JSON.parse(readFileSync(path, "utf8"));
row.versions = {
  clawql: clawqlVersionPin(),
  peer: peerVersionPin(peer, detected),
  stamped_at: new Date().toISOString(),
};
writeFileSync(path, `${JSON.stringify(row, null, 2)}\n`, "utf8");
process.stdout.write(
  JSON.stringify(
    {
      out: path,
      clawql: row.versions.clawql.commit_short,
      peer: row.versions.peer,
    },
    null,
    2
  ) + "\n"
);
