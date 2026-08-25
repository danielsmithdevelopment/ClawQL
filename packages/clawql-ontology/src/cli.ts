/**
 * clawql-ontology — lint / generate / scaffold / meta-ontology CLI
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "effect";
import { generateOntologyReadTools } from "./generate.js";
import { lintOntology } from "./lint.js";
import {
  createOntologyEntity,
  importOntologyPack,
  initOntologyTree,
  listOntologyPacks,
} from "./scaffold.js";
import { readOntologyMetaConfigSync } from "./effect/ontology-meta-config.js";
import { OntologyIndexLive } from "./shared/ontology-index.js";
import { scaffoldFromJsonSchema } from "./layer2/scaffold/json-schema.js";
import { checkPromotionCandidates, promoteDocumentType } from "./layer3/meta/promote.js";
import { metaStoreLayerForPath, MetaOntologyStoreService } from "./layer3/meta/store.js";
import type { JSONSchema } from "./shared/cqe-runtime-types.js";

function usage(): void {
  console.log(`clawql-ontology — enterprise Ontology (ADR 0009) + meta-ontology v0.1

Usage:
  clawql-ontology lint [--root DIR] [--schema PATH] [--dir PATH] [--strict] [--json] [files...]
  clawql-ontology generate [--root DIR] [--schema PATH] [--dir PATH] --out DIR [--skip-lint] [--json] [files...]
  clawql-ontology init [--root DIR] [--json]
  clawql-ontology create-entity <PascalCaseName> [--root DIR] [--json]
  clawql-ontology import --pack <id> [--root DIR] [--json]
  clawql-ontology scaffold --schema FILE [--document-type TYPE] [--ttl session|permanent|SECONDS] [--entity-id ID] [--json]
  clawql-ontology meta status [--json]
  clawql-ontology meta patterns --document-type TYPE [--json]
  clawql-ontology meta promote --check [--json]
  clawql-ontology meta promote --document-type TYPE --output DIR [--json]

Defaults:
  Entity search: CLAWQL_ONTOLOGY_DIR or .clawql/ontology/entities then examples/ontology/entities
  Schema: schemas/ontology/entity.schema.json
  Packs: ${listOntologyPacks().join(", ") || "(none)"}
  Meta DB: CLAWQL_ONTOLOGY_META_DB_PATH or ~/.ClawQL/meta-ontology.db

Examples:
  clawql-ontology lint examples/ontology/entities
  clawql-ontology generate --dir examples/ontology/entities --out generated/ontology
  clawql-ontology init && clawql-ontology import --pack legal
  clawql-ontology scaffold --schema invoice-schema.json --document-type invoice --ttl permanent
  clawql-ontology meta promote --check
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
    else if (a === "--out" || a === "--output") flags.out = argv[++i] ?? "";
    else if (a === "--pack") flags.pack = argv[++i] ?? "";
    else if (a === "--document-type") flags.documentType = argv[++i] ?? "";
    else if (a === "--ttl") flags.ttl = argv[++i] ?? "session";
    else if (a === "--entity-id") flags.entityId = argv[++i] ?? "";
    else if (a === "--strict") flags.strict = true;
    else if (a === "--skip-lint") flags.skipLint = true;
    else if (a === "--check") flags.check = true;
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

function parseTtlFlag(raw: string | boolean | undefined) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "session" || v === "permanent") return v;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
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
        `Generated ${result.tools.length} read tool(s), ${result.writeTools.length} gated write tool(s) for ${result.entities.length} entit(y/ies)`
      );
      if (result.deferredWriteActions.length) {
        console.log(
          `Deferred ${result.deferredWriteActions.length} write action(s) (non-LOW or non-NATIVE)`
        );
      }
      for (const w of written) console.log(`  wrote ${w}`);
    }
    process.exitCode = 0;
    return;
  }

  if (cmd === "init") {
    const written = await initOntologyTree(rootDir);
    if (flags.json) console.log(JSON.stringify({ ok: true, written }, null, 2));
    else {
      console.log("Initialized ontology tree:");
      for (const w of written) console.log(`  ${w}`);
    }
    return;
  }

  if (cmd === "create-entity") {
    const name = positional[0]?.trim();
    if (!name) {
      console.error("Usage: clawql-ontology create-entity <PascalCaseName>");
      process.exitCode = 1;
      return;
    }
    try {
      const dest = await createOntologyEntity(rootDir, name);
      if (flags.json) console.log(JSON.stringify({ ok: true, path: dest }, null, 2));
      else console.log(`Created ${dest}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "import") {
    const pack = typeof flags.pack === "string" ? flags.pack.trim() : "";
    if (!pack) {
      console.error(
        `Usage: clawql-ontology import --pack <id>\nAvailable: ${listOntologyPacks().join(", ") || "(none)"}`
      );
      process.exitCode = 1;
      return;
    }
    try {
      const written = await importOntologyPack(rootDir, pack);
      if (flags.json) console.log(JSON.stringify({ ok: true, written }, null, 2));
      else {
        console.log(`Imported pack ${pack}:`);
        for (const w of written) console.log(`  ${w}`);
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "scaffold") {
    const schemaFile =
      (typeof flags.schema === "string" && flags.schema.trim()) ||
      positional.find((p) => p.endsWith(".json"));
    if (!schemaFile) {
      console.error(
        "Usage: clawql-ontology scaffold --schema FILE [--document-type TYPE] [--ttl session|permanent|SECONDS]"
      );
      process.exitCode = 1;
      return;
    }
    try {
      const raw = await readFile(resolve(schemaFile), "utf8");
      const jsonSchema = JSON.parse(raw) as JSONSchema;
      const result = await Effect.runPromise(
        scaffoldFromJsonSchema(jsonSchema, {
          documentType: typeof flags.documentType === "string" ? flags.documentType : undefined,
          entityId: typeof flags.entityId === "string" ? flags.entityId : undefined,
          ttl: parseTtlFlag(flags.ttl),
          overwrite: true,
        }).pipe(Effect.provide(OntologyIndexLive))
      );
      if (flags.json) console.log(JSON.stringify({ ok: true, result }, null, 2));
      else {
        console.log(
          `Scaffolded ${result.entityId} (${result.fieldCount} fields, ${result.relationshipCount} relationships) source=${result.source ?? result.entity.source}`
        );
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "meta") {
    const sub = positional[0] ?? "status";
    const cfg = readOntologyMetaConfigSync();
    const layer = metaStoreLayerForPath(cfg.metaDbPath);

    if (sub === "status") {
      const summary = await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* MetaOntologyStoreService;
          return yield* store.statusSummary();
        }).pipe(Effect.provide(layer))
      );
      if (flags.json) console.log(JSON.stringify({ ok: true, summary }, null, 2));
      else {
        console.log("Meta-ontology status:");
        console.log(`  db: ${summary.dbPath}`);
        console.log(`  document types: ${summary.documentTypes}`);
        console.log(`  total evidence: ${summary.totalEvidence}`);
        console.log(`  promotion candidates: ${summary.promotionCandidates}`);
      }
      return;
    }

    if (sub === "patterns") {
      const documentType = typeof flags.documentType === "string" ? flags.documentType.trim() : "";
      if (!documentType) {
        console.error("Usage: clawql-ontology meta patterns --document-type TYPE");
        process.exitCode = 1;
        return;
      }
      const payload = await Effect.runPromise(
        Effect.gen(function* () {
          const store = yield* MetaOntologyStoreService;
          const learned = yield* store.getLearnedEntity(documentType);
          const failures = yield* store.getFailurePatterns(
            learned ? (JSON.parse(learned.entity_json) as { id: string }).id : documentType
          );
          const best = learned
            ? yield* store.getBestQueryPattern(
                (JSON.parse(learned.entity_json) as { id: string }).id,
                "enumerate_all"
              )
            : null;
          return { learned, failures, best };
        }).pipe(Effect.provide(layer))
      );
      if (flags.json) console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
      else {
        if (!payload.learned) {
          console.log(`No learned entity for ${documentType}`);
        } else {
          console.log(
            `${documentType}: evidence=${payload.learned.evidence_count} avgCPR=${payload.learned.avg_criterion_pass_rate.toFixed(3)}`
          );
          if (payload.best) {
            console.log(
              `  best query: success=${payload.best.successCount}/${payload.best.attemptCount} filters=${JSON.stringify(payload.best.filters)}`
            );
          }
          for (const f of payload.failures) {
            console.log(
              `  failure ${f.patternType}: ${f.patternDescription} (n=${f.occurrenceCount})`
            );
          }
        }
      }
      return;
    }

    if (sub === "promote") {
      if (flags.check === true) {
        const candidates = await Effect.runPromise(
          checkPromotionCandidates().pipe(Effect.provide(layer))
        );
        if (flags.json) console.log(JSON.stringify({ ok: true, candidates }, null, 2));
        else if (!candidates.length) {
          console.log(
            `No promotion candidates (need evidence>=${cfg.promotionEvidence}, CPR>=${cfg.promotionQuality})`
          );
        } else {
          console.log(
            `Promotion candidates (${cfg.promotionEvidence}+ sessions, ${(cfg.promotionQuality * 100).toFixed(0)}%+ CPR):`
          );
          for (const c of candidates) {
            console.log(
              `  ${c.documentType} (${c.evidenceCount} sessions, ${(c.avgCriterionPassRate * 100).toFixed(1)}% avg CPR) → ${c.suggestedCQEPath}`
            );
          }
        }
        return;
      }

      const documentType = typeof flags.documentType === "string" ? flags.documentType.trim() : "";
      const out =
        typeof flags.out === "string" && flags.out.trim() ? resolve(flags.out.trim()) : "";
      if (!documentType || !out) {
        console.error(
          "Usage: clawql-ontology meta promote --document-type TYPE --output DIR\n   or: clawql-ontology meta promote --check"
        );
        process.exitCode = 1;
        return;
      }
      try {
        const result = await Effect.runPromise(
          promoteDocumentType(documentType, out).pipe(Effect.provide(layer))
        );
        if (flags.json) console.log(JSON.stringify({ ok: true, result }, null, 2));
        else {
          console.log(`Promoted ${documentType} → ${result.outputPath}`);
          console.log(
            `Review then: clawql-ontology import --pack <id>  (or register the .cqe under packs/)`
          );
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
      return;
    }

    console.error("Usage: clawql-ontology meta status | patterns | promote");
    process.exitCode = 1;
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
