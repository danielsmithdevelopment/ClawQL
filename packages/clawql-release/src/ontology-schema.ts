/**
 * Hash / pin helpers for enterprise Ontology entity trees on release manifests.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { Effect, Result } from "effect";
import { sha256FileHexEffect } from "./hash.js";

const ENTITY_EXT = /\.(ya?ml|cqe|json)$/i;

export type OntologySchemaPin = {
  sha256: string;
  path: string;
  entityCount: number;
};

function walkEntityFilesEffect(dir: string): Effect.Effect<string[], Error> {
  return Effect.gen(function* () {
    const out: string[] = [];
    const entries = yield* Effect.tryPromise({
      try: () => readdir(dir, { withFileTypes: true }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...(yield* walkEntityFilesEffect(full)));
      } else if (e.isFile() && ENTITY_EXT.test(e.name)) {
        out.push(full);
      }
    }
    return out;
  });
}

/**
 * Deterministic SHA-256 over sorted `relPath=fileSha256` lines for all entity files
 * (Effect-primary).
 */
export function hashOntologyEntityTreeEffect(absDir: string): Effect.Effect<
  {
    sha256: string;
    entityCount: number;
    files: Array<{ relPath: string; sha256: string }>;
  },
  Error
> {
  return Effect.gen(function* () {
    const filesAbs = (yield* walkEntityFilesEffect(absDir)).sort((a, b) => a.localeCompare(b));
    const files: Array<{ relPath: string; sha256: string }> = [];
    const lines: string[] = [];
    for (const abs of filesAbs) {
      const { hex } = yield* sha256FileHexEffect(abs);
      const relPath = relative(absDir, abs).replace(/\\/g, "/");
      files.push({ relPath, sha256: hex });
      lines.push(`${relPath}=${hex}`);
    }
    const sha256 = createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
    return { sha256, entityCount: files.length, files };
  });
}

/** Promise façade for callers that still await ontology tree hashing. */
export async function hashOntologyEntityTree(absDir: string): Promise<{
  sha256: string;
  entityCount: number;
  files: Array<{ relPath: string; sha256: string }>;
}> {
  return Effect.runPromise(hashOntologyEntityTreeEffect(absDir));
}

/**
 * Prefer `.clawql/ontology/entities`, then `docs/examples/ontology/entities`.
 */
export function resolveOntologyEntitiesDir(rootDir: string): string | null {
  const candidates = [".clawql/ontology/entities", "docs/examples/ontology/entities"];
  for (const rel of candidates) {
    const abs = join(rootDir, rel);
    if (existsSync(abs)) return rel.replace(/\\/g, "/");
  }
  return null;
}

/** Collect ontology schema pin for a release manifest (Effect-primary). */
export function collectOntologySchemaPinEffect(
  rootDir: string,
  entitiesRelPath?: string
): Effect.Effect<OntologySchemaPin | undefined, Error> {
  return Effect.gen(function* () {
    const rel = entitiesRelPath ?? resolveOntologyEntitiesDir(rootDir);
    if (!rel) return undefined;
    const abs = join(rootDir, rel);
    const st = yield* Effect.tryPromise({
      try: () => stat(abs),
      catch: () => undefined,
    }).pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (!st?.isDirectory()) return undefined;
    const { sha256, entityCount } = yield* hashOntologyEntityTreeEffect(abs);
    if (entityCount === 0) return undefined;
    return { sha256, path: rel, entityCount };
  });
}

/** Promise façade for callers that still await ontology pin collection. */
export async function collectOntologySchemaPin(
  rootDir: string,
  entitiesRelPath?: string
): Promise<OntologySchemaPin | undefined> {
  return Effect.runPromise(collectOntologySchemaPinEffect(rootDir, entitiesRelPath));
}

/** Verify an ontology schema pin against the workspace tree (Effect-primary). */
export function verifyOntologySchemaPinEffect(
  rootDir: string,
  pin: OntologySchemaPin
): Effect.Effect<string | null> {
  return Effect.gen(function* () {
    const abs = join(rootDir, pin.path);
    const hashed = yield* hashOntologyEntityTreeEffect(abs).pipe(Effect.result);
    if (Result.isFailure(hashed)) {
      const e = hashed.failure;
      return `ontologySchema path unreadable (${pin.path}): ${e instanceof Error ? e.message : String(e)}`;
    }
    if (hashed.success.sha256 !== pin.sha256) {
      return `ontologySchema sha256 mismatch: expected ${pin.sha256}, got ${hashed.success.sha256}`;
    }
    return null;
  });
}

/** Promise façade for callers that still await ontology pin verify. */
export async function verifyOntologySchemaPin(
  rootDir: string,
  pin: OntologySchemaPin
): Promise<string | null> {
  return Effect.runPromise(verifyOntologySchemaPinEffect(rootDir, pin));
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

/** Lint `.cqm` files for required apiVersion/kind/name (Effect-primary). */
export function lintCqmFilesEffect(paths: string[]): Effect.Effect<CqmLintResult, Error> {
  return Effect.gen(function* () {
    const issues: CqmLintIssue[] = [];
    let filesChecked = 0;

    for (const p of paths) {
      const rawResult = yield* Effect.tryPromise({
        try: () => readFile(p, "utf8"),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
      }).pipe(Effect.result);
      if (Result.isFailure(rawResult)) {
        const e = rawResult.failure;
        issues.push({
          path: p,
          severity: "error",
          message: `unreadable: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }
      const raw = rawResult.success;
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
      // Avoid nested quantifiers on metadata blocks (ReDoS); scan lines instead.
      let name: string | undefined;
      let inMetadata = false;
      for (const line of raw.split(/\r?\n/)) {
        if (/^metadata:\s*$/.test(line)) {
          inMetadata = true;
          continue;
        }
        if (inMetadata) {
          if (/^[^\s#]/.test(line)) {
            inMetadata = false;
          } else {
            const nm = /^[ \t]+name:\s*(.+)$/.exec(line);
            if (nm) {
              name = nm[1]?.trim().replace(/^["']|["']$/g, "");
              break;
            }
          }
        }
      }
      if (!name) {
        name = /^[ \t]+name:\s*(.+)$/m
          .exec(raw)?.[1]
          ?.trim()
          .replace(/^["']|["']$/g, "");
      }
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
  });
}

/** Promise façade for callers that still await CQM lint. */
export async function lintCqmFiles(paths: string[]): Promise<CqmLintResult> {
  return Effect.runPromise(lintCqmFilesEffect(paths));
}
