/**
 * Ontology tree / pack presence for `clawql doctor`.
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getPackageRoot } from "clawql-api";
import type { DoctorCheck } from "./doctor.js";

function packageRootOrCwd(): string {
  try {
    return getPackageRoot();
  } catch {
    return process.cwd();
  }
}

async function countEntityFiles(dir: string): Promise<number> {
  let n = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) n += await countEntityFiles(full);
    else if (/\.(ya?ml|cqe|json)$/i.test(e.name)) n += 1;
  }
  return n;
}

export async function runOntologyDoctorCheck(): Promise<DoctorCheck> {
  const root = packageRootOrCwd();
  const override = process.env.CLAWQL_ONTOLOGY_DIR?.trim();
  const candidates = override
    ? [override]
    : [".clawql/ontology/entities", "examples/ontology/entities"];

  for (const rel of candidates) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const count = await countEntityFiles(abs);
    if (count === 0) {
      return {
        level: "warn",
        message: `ontology entities dir empty: ${rel}`,
        detail: "Add .cqe/.yaml entities or run: clawql ontology import --pack legal",
      };
    }
    return {
      level: "ok",
      message: `ontology entities: ${rel} (${count} file(s))`,
      detail: process.env.CLAWQL_ENABLE_ONTOLOGY
        ? "CLAWQL_ENABLE_ONTOLOGY set — fixture MCP tools register at gateway start"
        : "Live tools: set CLAWQL_ENABLE_ONTOLOGY=1 (fixture-backed demo)",
    };
  }

  return {
    level: "warn",
    message: "ontology entities dir not found",
    detail:
      "Run: clawql ontology init && clawql ontology import --pack legal (or use examples/ontology/entities)",
  };
}
