/**
 * Lint ontology Entity documents against JSON Schema + semantic rules.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Import from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import {
  defaultOntologySearchRoots,
  loadOntologyEntities,
} from "./load.js";
import type {
  LoadedOntologyEntity,
  OntologyIssue,
  OntologyLintResult,
} from "./types.js";

// ajv CJS/ESM interop — runtime default is constructable; types expose a namespace.
const Ajv2020 = (Ajv2020Import as unknown as { default?: new (opts?: object) => AjvLike }).default
  ? (Ajv2020Import as unknown as { default: new (opts?: object) => AjvLike }).default
  : (Ajv2020Import as unknown as new (opts?: object) => AjvLike);

type AjvLike = {
  compile: (schema: object) => ((data: unknown) => boolean) & {
    errors?: ErrorObject[] | null;
  };
};

function packageRoot(): string | null {
  try {
    const metaUrl = import.meta.url;
    if (!metaUrl) return null;
    return resolve(dirname(fileURLToPath(metaUrl)), "..");
  } catch {
    return null;
  }
}

/** Resolve default entity.schema.json shipped with the monorepo (or package-relative fallback). */
export function defaultEntitySchemaPath(rootDir?: string): string {
  if (rootDir) {
    return join(resolve(rootDir), "schemas", "ontology", "entity.schema.json");
  }
  const pkg = packageRoot();
  if (pkg) {
    return join(pkg, "..", "..", "schemas", "ontology", "entity.schema.json");
  }
  return join(process.cwd(), "schemas", "ontology", "entity.schema.json");
}

async function loadSchema(schemaPath: string): Promise<object> {
  const raw = await readFile(resolve(schemaPath), "utf8");
  return JSON.parse(raw) as object;
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || "/";
  return `${path} ${err.message ?? "invalid"}`.trim();
}

function semanticIssues(loaded: LoadedOntologyEntity[]): OntologyIssue[] {
  const issues: OntologyIssue[] = [];
  const names = new Map<string, string>();
  const actionNames = new Map<string, string>();

  for (const { path, entity } of loaded) {
    const name = entity?.metadata?.name;
    if (typeof name === "string" && name) {
      const prev = names.get(name);
      if (prev) {
        issues.push({
          severity: "error",
          path,
          message: `Duplicate entity metadata.name "${name}" (also defined in ${prev})`,
        });
      } else {
        names.set(name, path);
      }
    }

    for (const [propName, prop] of Object.entries(entity.spec?.properties ?? {})) {
      if (prop?.type === "enum" && (!Array.isArray(prop.values) || prop.values.length === 0)) {
        issues.push({
          severity: "error",
          path,
          pointer: `/spec/properties/${propName}`,
          message: `Property "${propName}" has type enum but no values`,
        });
      }
    }

    for (const action of entity.spec?.actions ?? []) {
      const key = action.name;
      if (!key) continue;
      const prev = actionNames.get(key);
      if (prev) {
        issues.push({
          severity: "warning",
          path,
          message: `Action name "${key}" already used in ${prev} — MCP tool names should be unique`,
        });
      } else {
        actionNames.set(key, path);
      }

      if (action.kind === "write") {
        if (action.kinetic !== true) {
          issues.push({
            severity: "error",
            path,
            pointer: `/spec/actions/${action.name}`,
            message: `Write action "${action.name}" must set kinetic: true`,
          });
        }
        for (const req of [
          "kinetic_level",
          "blast_radius",
          "rollback_protocol",
          "executor",
        ] as const) {
          if (!action[req]) {
            issues.push({
              severity: "error",
              path,
              pointer: `/spec/actions/${action.name}`,
              message: `Write action "${action.name}" missing required field ${req}`,
            });
          }
        }
      }
    }
  }

  // Relationship targets
  for (const { path, entity } of loaded) {
    for (const rel of entity.spec?.relationships ?? []) {
      if (!rel.entity) continue;
      if (!names.has(rel.entity)) {
        issues.push({
          severity: "warning",
          path,
          message: `Relationship target entity "${rel.entity}" is not defined in the linted set`,
        });
      }
    }
  }

  return issues;
}

export type LintOntologyOptions = {
  /** Workspace root (used for default schema + search roots). */
  rootDir?: string;
  /** Explicit entity files or directories. */
  paths?: string[];
  /** Path to entity.schema.json */
  schemaPath?: string;
  /** When true, treat warnings as errors for exit code. */
  strict?: boolean;
};

/**
 * Validate ontology entity YAML/JSON files.
 * If `paths` is empty, searches `.clawql/ontology/entities` then `examples/ontology/entities`.
 */
export async function lintOntology(opts: LintOntologyOptions = {}): Promise<OntologyLintResult> {
  const rootDir = resolve(opts.rootDir ?? process.cwd());
  const schemaPath = resolve(opts.schemaPath ?? defaultEntitySchemaPath(rootDir));
  const search =
    opts.paths && opts.paths.length > 0
      ? opts.paths.map((p) => (isAbsolute(p) ? p : resolve(rootDir, p)))
      : defaultOntologySearchRoots(rootDir);

  const { loaded, loadErrors } = await loadOntologyEntities(search);
  const issues: OntologyIssue[] = loadErrors.map((e) => ({
    severity: "error" as const,
    path: e.path,
    message: `Failed to parse: ${e.message}`,
  }));

  if (loaded.length === 0 && loadErrors.length === 0) {
    issues.push({
      severity: "error",
      path: rootDir,
      message: `No ontology entity files found under: ${search.join(", ")}`,
    });
    return { ok: false, filesChecked: 0, entities: [], issues };
  }

  let schema: object;
  try {
    schema = await loadSchema(schemaPath);
  } catch (e) {
    issues.push({
      severity: "error",
      path: schemaPath,
      message: `Cannot load schema: ${e instanceof Error ? e.message : String(e)}`,
    });
    return {
      ok: false,
      filesChecked: loaded.length,
      entities: [],
      issues,
    };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  for (const { path, entity } of loaded) {
    const ok = validate(entity);
    if (!ok && validate.errors) {
      for (const err of validate.errors) {
        issues.push({
          severity: "error",
          path,
          pointer: err.instancePath || undefined,
          message: formatAjvError(err),
        });
      }
    }
  }

  issues.push(...semanticIssues(loaded));

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const ok = errors.length === 0 && !(opts.strict && warnings.length > 0);

  return {
    ok,
    filesChecked: loaded.length,
    entities: loaded.map((l) => l.entity.metadata?.name).filter(Boolean) as string[],
    issues,
  };
}
