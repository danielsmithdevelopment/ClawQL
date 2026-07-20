/**
 * `clawql ontology` — thin wrapper over clawql-ontology.
 */

import { resolve } from "node:path";
import { generateOntologyReadTools, lintOntology } from "clawql-ontology";

export type OntologyCliOptions = {
  root?: string;
  schema?: string;
  dir?: string;
  out?: string;
  strict?: boolean;
  skipLint?: boolean;
  json?: boolean;
  paths?: string[];
};

function rootDir(opts: OntologyCliOptions): string {
  return resolve(opts.root ?? process.cwd());
}

function collectPaths(opts: OntologyCliOptions): string[] | undefined {
  const out: string[] = [];
  if (opts.dir?.trim()) out.push(opts.dir.trim());
  if (opts.paths?.length) out.push(...opts.paths);
  return out.length ? out : undefined;
}

export async function runOntologyLint(opts: OntologyCliOptions): Promise<number> {
  const result = await lintOntology({
    rootDir: rootDir(opts),
    paths: collectPaths(opts),
    schemaPath: opts.schema ? resolve(opts.schema) : undefined,
    strict: opts.strict,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `ontology lint: ${result.filesChecked} file(s), ${result.entities.length} entit(y/ies)`
    );
    for (const issue of result.issues) {
      const loc = issue.pointer ? `${issue.path}:${issue.pointer}` : issue.path;
      console.log(`${issue.severity.toUpperCase()} ${loc}: ${issue.message}`);
    }
    console.log(result.ok ? "OK" : "FAILED");
  }
  return result.ok ? 0 : 1;
}

export async function runOntologyGenerate(opts: OntologyCliOptions): Promise<number> {
  if (!opts.out?.trim()) {
    console.error("Usage: clawql ontology generate --out DIR [--dir PATH] [files...]");
    return 1;
  }
  const { result, lint, written } = await generateOntologyReadTools({
    rootDir: rootDir(opts),
    paths: collectPaths(opts),
    schemaPath: opts.schema ? resolve(opts.schema) : undefined,
    outDir: resolve(opts.out.trim()),
    skipLint: opts.skipLint,
  });
  if (lint && !lint.ok) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: false, lint, result }, null, 2));
    } else {
      console.error("ontology generate aborted: lint failed");
      for (const issue of lint.issues.filter((i) => i.severity === "error")) {
        console.error(`ERROR ${issue.path}: ${issue.message}`);
      }
    }
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, result, written }, null, 2));
  } else {
    console.log(
      `Generated ${result.tools.length} read tool(s) for ${result.entities.length} entit(y/ies)`
    );
    if (result.deferredWriteActions.length) {
      console.log(
        `Deferred ${result.deferredWriteActions.length} write/kinetic action(s) until Transaction Sandbox`
      );
    }
    for (const w of written) console.log(`  wrote ${w}`);
  }
  return 0;
}
