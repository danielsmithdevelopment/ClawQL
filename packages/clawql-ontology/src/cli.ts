/**
 * clawql-ontology — lint + generate CLI
 */
import { resolve } from "node:path";
import { generateOntologyReadTools } from "./generate.js";
import { lintOntology } from "./lint.js";

function usage(): void {
  console.log(`clawql-ontology — enterprise Ontology lint / generate (ADR 0009)

Usage:
  clawql-ontology lint [--root DIR] [--schema PATH] [--dir PATH] [--strict] [--json] [files...]
  clawql-ontology generate [--root DIR] [--schema PATH] [--dir PATH] --out DIR [--skip-lint] [--json] [files...]

Defaults:
  Entity search: .clawql/ontology/entities then examples/ontology/entities
  Schema: schemas/ontology/entity.schema.json

Examples:
  clawql-ontology lint examples/ontology/entities
  clawql-ontology generate --dir examples/ontology/entities --out generated/ontology
`);
}

function parseArgs(argv: string[]): {
  cmd: string;
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--root") flags.root = argv[++i] ?? ".";
    else if (a === "--schema") flags.schema = argv[++i] ?? "";
    else if (a === "--dir") flags.dir = argv[++i] ?? "";
    else if (a === "--out") flags.out = argv[++i] ?? "";
    else if (a === "--strict") flags.strict = true;
    else if (a === "--skip-lint") flags.skipLint = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--help" || a === "-h") flags.help = true;
    else if (!a.startsWith("-")) positional.push(a);
  }
  return { cmd: positional[0] ?? "help", flags, positional: positional.slice(1) };
}

function collectPaths(flags: Record<string, string | boolean>, positional: string[]): string[] {
  const out: string[] = [...positional];
  if (typeof flags.dir === "string" && flags.dir.trim()) out.unshift(flags.dir.trim());
  return out;
}

async function main(): Promise<void> {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2));
  if (flags.help || cmd === "help") {
    usage();
    return;
  }

  const rootDir = resolve(
    typeof flags.root === "string" && flags.root ? flags.root : process.cwd()
  );
  const schemaPath =
    typeof flags.schema === "string" && flags.schema.trim()
      ? resolve(flags.schema.trim())
      : undefined;
  const paths = collectPaths(flags, positional);

  if (cmd === "lint") {
    const result = await lintOntology({
      rootDir,
      paths: paths.length ? paths : undefined,
      schemaPath,
      strict: flags.strict === true,
    });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(
        `ontology lint: ${result.filesChecked} file(s), ${result.entities.length} entit(y/ies)`
      );
      for (const issue of result.issues) {
        const loc = issue.pointer ? `${issue.path}:${issue.pointer}` : issue.path;
        console.log(`${issue.severity.toUpperCase()} ${loc}: ${issue.message}`);
      }
      if (result.ok) console.log("OK");
      else console.log("FAILED");
    }
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (cmd === "generate") {
    const out = typeof flags.out === "string" && flags.out.trim() ? resolve(flags.out.trim()) : "";
    if (!out) {
      console.error("Usage: clawql-ontology generate --out DIR [...files]");
      process.exitCode = 1;
      return;
    }
    const { result, lint, written } = await generateOntologyReadTools({
      rootDir,
      paths: paths.length ? paths : undefined,
      schemaPath,
      outDir: out,
      skipLint: flags.skipLint === true,
    });
    if (lint && !lint.ok) {
      if (flags.json) {
        console.log(JSON.stringify({ ok: false, lint, result }, null, 2));
      } else {
        console.error("ontology generate aborted: lint failed");
        for (const issue of lint.issues.filter((i) => i.severity === "error")) {
          console.error(`ERROR ${issue.path}: ${issue.message}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    if (flags.json) {
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
    process.exitCode = 0;
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
