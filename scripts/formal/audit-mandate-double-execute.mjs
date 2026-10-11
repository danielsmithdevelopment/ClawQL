#!/usr/bin/env node
/**
 * Hunt WORM / audit trails for mandate IDs with more than one successful consume
 * or execute. Use before launch to see whether the pre-atomic race fired in the wild.
 *
 * Usage:
 *   node scripts/formal/audit-mandate-double-execute.mjs --file trail.ndjson
 *   node scripts/formal/audit-mandate-double-execute.mjs --dir ~/.ClawQL/worm
 *
 * Reads NDJSON (one WORM entry JSON per line) or a JSON array of entries.
 * Flags executionIds with ≥2 of: MANDATE_CONSUMED, or TOOL_CALL_RESULT with ok+executionId.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

function usage() {
  console.log(`Usage:
  node scripts/formal/audit-mandate-double-execute.mjs --file <path>
  node scripts/formal/audit-mandate-double-execute.mjs --dir <path>
`);
}

function executionIdFrom(entry) {
  const md = entry?.metadata ?? {};
  if (typeof md.executionId === "string" && md.executionId.startsWith("pex_")) {
    return md.executionId;
  }
  return null;
}

function isConsumeOrSuccess(entry) {
  if (entry?.type === "MANDATE_CONSUMED") return true;
  if (entry?.type === "TOOL_CALL_RESULT" && entry?.metadata?.ok === true && executionIdFrom(entry)) {
    return true;
  }
  // Legacy: HUMAN_APPROVAL alone is not an execute; count completed finalize
  if (entry?.type === "MANDATE_FINALIZED" && entry?.metadata?.ok === true) return true;
  return false;
}

async function loadEntries(path) {
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    usage();
    process.exit(args.includes("--help") ? 0 : 1);
  }
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      files.push(args[++i]);
    } else if (args[i] === "--dir" && args[i + 1]) {
      const dir = args[++i];
      const names = await readdir(dir);
      for (const n of names) {
        if (n.endsWith(".ndjson") || n.endsWith(".jsonl") || n.endsWith(".json")) {
          files.push(join(dir, n));
        }
      }
    }
  }
  if (files.length === 0) {
    usage();
    process.exit(1);
  }

  /** @type {Map<string, object[]>} */
  const byId = new Map();
  for (const f of files) {
    const entries = await loadEntries(f);
    for (const e of entries) {
      if (!isConsumeOrSuccess(e)) continue;
      const id = executionIdFrom(e);
      if (!id) continue;
      const list = byId.get(id) ?? [];
      list.push(e);
      byId.set(id, list);
    }
  }

  const suspects = [...byId.entries()].filter(([, ev]) => ev.length >= 2);
  if (suspects.length === 0) {
    console.log(`OK: scanned ${files.length} file(s); no mandate with ≥2 consume/success events.`);
    process.exit(0);
  }
  console.error(`ALERT: ${suspects.length} mandate id(s) with multiple consume/success events:`);
  for (const [id, ev] of suspects) {
    console.error(`  ${id}: ${ev.length} events`);
    for (const e of ev) {
      console.error(`    - ${e.type} @ ${e.timestamp ?? e.writtenAt ?? "?"}`);
    }
  }
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
