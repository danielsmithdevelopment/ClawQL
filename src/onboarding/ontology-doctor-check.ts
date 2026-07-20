/**
 * Ontology tree / Git-schema policy for `clawql doctor` (essay gap 4.4).
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

/** True when env claims schema lives only in object storage (anti-pattern). */
export function ontologySchemaLooksRemoteOnly(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const store = env.CLAWQL_ONTOLOGY_SCHEMA_STORE?.trim().toLowerCase();
  if (store === "r2" || store === "s3" || store === "gcs" || store === "object" || store === "remote") {
    return true;
  }
  if (env.CLAWQL_ONTOLOGY_SCHEMA_IN_OBJECT_STORAGE === "1") return true;
  const uri = env.CLAWQL_ONTOLOGY_SCHEMA_URI?.trim().toLowerCase() ?? "";
  if (/^(s3|r2|gs|https?):\/\//.test(uri) && /r2|s3\.amazonaws|storage\.googleapis|blob\.core/.test(uri)) {
    return true;
  }
  return false;
}

export async function runOntologyDoctorChecks(
  env: NodeJS.ProcessEnv = process.env
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const root = packageRootOrCwd();
  const override = env.CLAWQL_ONTOLOGY_DIR?.trim();
  const candidates = override
    ? [override]
    : [".clawql/ontology/entities", "examples/ontology/entities"];

  let localCount = 0;
  let localRel: string | undefined;

  for (const rel of candidates) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const count = await countEntityFiles(abs);
    if (count === 0) {
      checks.push({
        level: "warn",
        message: `ontology entities dir empty: ${rel}`,
        detail:
          "Schema belongs in Git (ADR 0009). Add .cqe entities or: clawql ontology import --pack legal",
      });
      continue;
    }
    localCount = count;
    localRel = rel;
    break;
  }

  if (localRel && localCount > 0) {
    checks.push({
      level: "ok",
      message: `ontology schema in Git: ${localRel} (${localCount} file(s))`,
      detail: env.CLAWQL_ENABLE_ONTOLOGY
        ? "CLAWQL_ENABLE_ONTOLOGY set — fixture MCP tools register at gateway start"
        : "Live tools: set CLAWQL_ENABLE_ONTOLOGY=1 (fixture-backed demo)",
    });
  } else if (!checks.some((c) => c.message.includes("empty"))) {
    checks.push({
      level: "warn",
      message: "ontology schema not found in Git working tree",
      detail:
        "Policy: entity schemas live in Git (.clawql/ontology/entities); instances may use R2. Run: clawql ontology init && clawql ontology import --pack legal",
    });
  }

  if (ontologySchemaLooksRemoteOnly(env)) {
    checks.push({
      level: "warn",
      message: "ontology schema configured as object-storage-only",
      detail:
        "ADR 0009 / essay 4.4: keep .cqe definitions in Git for PR review + release pins. Use R2 for instances/memory, not schema. Unset CLAWQL_ONTOLOGY_SCHEMA_STORE / CLAWQL_ONTOLOGY_SCHEMA_URI if set by mistake.",
    });
  } else {
    checks.push({
      level: "ok",
      message: "ontology storage policy: schema→Git, instances→R2",
      detail: "doctor warns if schema is missing locally or marked remote-only",
    });
  }

  return checks;
}

/** @deprecated use runOntologyDoctorChecks — kept for single-check call sites */
export async function runOntologyDoctorCheck(): Promise<DoctorCheck> {
  const checks = await runOntologyDoctorChecks();
  return (
    checks.find((c) => c.level !== "ok") ??
    checks[0] ?? {
      level: "warn",
      message: "ontology doctor: no checks",
    }
  );
}
