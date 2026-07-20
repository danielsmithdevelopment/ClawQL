/**
 * Hash / pin helpers for enterprise Ontology entity trees on release manifests.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { sha256FileHex } from "./hash.js";

const ENTITY_EXT = /\.(ya?ml|cqe|json)$/i;

export type OntologySchemaPin = {
  sha256: string;
  path: string;
  entityCount: number;
};

async function walkEntityFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkEntityFiles(full)));
    } else if (e.isFile() && ENTITY_EXT.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Deterministic SHA-256 over sorted `relPath=fileSha256` lines for all entity files.
 */
export async function hashOntologyEntityTree(absDir: string): Promise<{
  sha256: string;
  entityCount: number;
  files: Array<{ relPath: string; sha256: string }>;
}> {
  const filesAbs = (await walkEntityFiles(absDir)).sort((a, b) => a.localeCompare(b));
  const files: Array<{ relPath: string; sha256: string }> = [];
  const lines: string[] = [];
  for (const abs of filesAbs) {
    const { hex } = await sha256FileHex(abs);
    const relPath = relative(absDir, abs).replace(/\\/g, "/");
    files.push({ relPath, sha256: hex });
    lines.push(`${relPath}=${hex}`);
  }
  const sha256 = createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
  return { sha256, entityCount: files.length, files };
}

/**
 * Prefer `.clawql/ontology/entities`, then `examples/ontology/entities`.
 */
export function resolveOntologyEntitiesDir(rootDir: string): string | null {
  const candidates = [".clawql/ontology/entities", "examples/ontology/entities"];
  for (const rel of candidates) {
    const abs = join(rootDir, rel);
    if (existsSync(abs)) return rel.replace(/\\/g, "/");
  }
  return null;
}

export async function collectOntologySchemaPin(
  rootDir: string,
  entitiesRelPath?: string
): Promise<OntologySchemaPin | undefined> {
  const rel = entitiesRelPath ?? resolveOntologyEntitiesDir(rootDir);
  if (!rel) return undefined;
  const abs = join(rootDir, rel);
  try {
    const st = await stat(abs);
    if (!st.isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const { sha256, entityCount } = await hashOntologyEntityTree(abs);
  if (entityCount === 0) return undefined;
  return { sha256, path: rel, entityCount };
}

export async function verifyOntologySchemaPin(
  rootDir: string,
  pin: OntologySchemaPin
): Promise<string | null> {
  const abs = join(rootDir, pin.path);
  try {
    const { sha256 } = await hashOntologyEntityTree(abs);
    if (sha256 !== pin.sha256) {
      return `ontologySchema sha256 mismatch: expected ${pin.sha256}, got ${sha256}`;
    }
  } catch (e) {
    return `ontologySchema path unreadable (${pin.path}): ${e instanceof Error ? e.message : String(e)}`;
  }
  return null;
}

/** Minimal `.cqm` structural lint (ADR 0010 / essay gap 5.2). */
export type CqmLintIssue = {
  path: string;
  severity: "error" | "warning";
  message: string;
};

export type CqmLintResult = {
  ok: boolean;
  filesChecked: number;
  issues: CqmLintIssue[];
};

const CQM_KINDS = new Set(["ReleaseManifest", "EnterpriseGovernance", "Policy"]);

export async function lintCqmFiles(paths: string[]): Promise<CqmLintResult> {
  const issues: CqmLintIssue[] = [];
  let filesChecked = 0;

  for (const p of paths) {
    let raw: string;
    try {
      raw = await readFile(p, "utf8");
    } catch (e) {
      issues.push({
        path: p,
        severity: "error",
        message: `unreadable: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    filesChecked += 1;
    // Lightweight YAML field extract (avoid yaml dep in clawql-release).
    const apiVersion = /^apiVersion:\s*(.+)$/m
      .exec(raw)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
    const kind = /^kind:\s*(.+)$/m
      .exec(raw)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
    const nameMatch =
      /^metadata:\s*\r?\n(?:[ \t]+.+\r?\n)*?[ \t]+name:\s*(.+)$/m.exec(raw) ??
      /^[ \t]+name:\s*(.+)$/m.exec(raw);
    const name = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "");

    if (!apiVersion) {
      issues.push({ path: p, severity: "error", message: "missing apiVersion" });
    } else if (!apiVersion.startsWith("clawql.dev/manifest/")) {
      issues.push({
        path: p,
        severity: "warning",
        message: `apiVersion "${apiVersion}" is not clawql.dev/manifest/*`,
      });
    }
    if (!kind) {
      issues.push({ path: p, severity: "error", message: "missing kind" });
    } else if (!CQM_KINDS.has(kind)) {
      issues.push({
        path: p,
        severity: "error",
        message: `kind "${kind}" must be one of ${[...CQM_KINDS].join(", ")}`,
      });
    }
    if (!name) {
      issues.push({ path: p, severity: "error", message: "missing metadata.name" });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, filesChecked, issues };
}
