/**
 * `clawql ontology` — thin wrapper over clawql-ontology.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect } from "effect";
import {
  checkPromotionCandidates,
  createOntologyEntity,
  generateOntologyReadTools,
  importOntologyPack,
  initOntologyTree,
  lintOntology,
  listOntologyPacks,
  metaStoreLayerForPath,
  MetaOntologyStoreService,
  OntologyIndexLive,
  promoteDocumentType,
  readOntologyMetaConfigSync,
  scaffoldFromJsonSchema,
  type JSONSchema,
} from "clawql-ontology";

export type OntologyCliOptions = {
  root?: string;
  schema?: string;
  dir?: string;
  out?: string;
  strict?: boolean;
  skipLint?: boolean;
  json?: boolean;
  paths?: string[];
  pack?: string;
  name?: string;
  documentType?: string;
  ttl?: string;
  entityId?: string;
  check?: boolean;
  metaSub?: string;
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

function parseTtl(raw: string | undefined) {
  if (!raw?.trim()) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "session" || v === "permanent") return v;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
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
      `Generated ${result.tools.length} read tool(s), ${result.writeTools.length} gated write tool(s) for ${result.entities.length} entit(y/ies)`
    );
    if (result.deferredWriteActions.length) {
      console.log(
        `Deferred ${result.deferredWriteActions.length} write action(s) (non-LOW or non-NATIVE)`
      );
    }
    for (const w of written) console.log(`  wrote ${w}`);
  }
  return 0;
}

export async function runOntologyInit(opts: OntologyCliOptions): Promise<number> {
  const written = await initOntologyTree(rootDir(opts));
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, written }, null, 2));
  } else {
    console.log("Initialized ontology tree:");
    for (const w of written) console.log(`  ${w}`);
  }
  return 0;
}

export async function runOntologyCreateEntity(opts: OntologyCliOptions): Promise<number> {
  const name = opts.name?.trim() || opts.paths?.[0]?.trim();
  if (!name) {
    console.error("Usage: clawql ontology create-entity <PascalCaseName>");
    return 1;
  }
  try {
    const dest = await createOntologyEntity(rootDir(opts), name);
    if (opts.json) console.log(JSON.stringify({ ok: true, path: dest }, null, 2));
    else console.log(`Created ${dest}`);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

export async function runOntologyImport(opts: OntologyCliOptions): Promise<number> {
  const pack = opts.pack?.trim();
  if (!pack) {
    console.error(
      `Usage: clawql ontology import --pack <id>\nAvailable: ${listOntologyPacks().join(", ") || "(none)"}`
    );
    return 1;
  }
  try {
    const written = await importOntologyPack(rootDir(opts), pack);
    if (opts.json) console.log(JSON.stringify({ ok: true, written }, null, 2));
    else {
      console.log(`Imported pack ${pack}:`);
      for (const w of written) console.log(`  ${w}`);
    }
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

export async function runOntologyScaffold(opts: OntologyCliOptions): Promise<number> {
  const schemaFile = opts.schema?.trim();
  if (!schemaFile) {
    console.error(
      "Usage: clawql ontology scaffold --schema FILE [--document-type TYPE] [--ttl session|permanent|SECONDS]"
    );
    return 1;
  }
  try {
    const raw = await readFile(resolve(schemaFile), "utf8");
    const jsonSchema = JSON.parse(raw) as JSONSchema;
    const result = await Effect.runPromise(
      scaffoldFromJsonSchema(jsonSchema, {
        documentType: opts.documentType,
        entityId: opts.entityId,
        ttl: parseTtl(opts.ttl),
        overwrite: true,
      }).pipe(Effect.provide(OntologyIndexLive))
    );
    if (opts.json) console.log(JSON.stringify({ ok: true, result }, null, 2));
    else {
      console.log(
        `Scaffolded ${result.entityId} (${result.fieldCount} fields, ${result.relationshipCount} relationships)`
      );
    }
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

export async function runOntologyMeta(opts: OntologyCliOptions): Promise<number> {
  const sub = opts.metaSub ?? "status";
  const cfg = readOntologyMetaConfigSync();
  const layer = metaStoreLayerForPath(cfg.metaDbPath);

  if (sub === "status") {
    const summary = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* MetaOntologyStoreService;
        return yield* store.statusSummary();
      }).pipe(Effect.provide(layer))
    );
    if (opts.json) console.log(JSON.stringify({ ok: true, summary }, null, 2));
    else {
      console.log("Meta-ontology status:");
      console.log(`  db: ${summary.dbPath}`);
      console.log(`  document types: ${summary.documentTypes}`);
      console.log(`  total evidence: ${summary.totalEvidence}`);
      console.log(`  promotion candidates: ${summary.promotionCandidates}`);
    }
    return 0;
  }

  if (sub === "patterns") {
    const documentType = opts.documentType?.trim();
    if (!documentType) {
      console.error("Usage: clawql ontology meta patterns --document-type TYPE");
      return 1;
    }
    const payload = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* MetaOntologyStoreService;
        const learned = yield* store.getLearnedEntity(documentType);
        const entityId = learned
          ? (JSON.parse(learned.entity_json) as { id: string }).id
          : documentType;
        const failures = yield* store.getFailurePatterns(entityId);
        const best = learned
          ? yield* store.getBestQueryPattern(entityId, "enumerate_all")
          : null;
        return { learned, failures, best };
      }).pipe(Effect.provide(layer))
    );
    if (opts.json) console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
    else if (!payload.learned) console.log(`No learned entity for ${documentType}`);
    else {
      console.log(
        `${documentType}: evidence=${payload.learned.evidence_count} avgCPR=${payload.learned.avg_criterion_pass_rate.toFixed(3)}`
      );
      if (payload.best) {
        console.log(
          `  best query: success=${payload.best.successCount}/${payload.best.attemptCount}`
        );
      }
    }
    return 0;
  }

  if (sub === "promote") {
    if (opts.check) {
      const candidates = await Effect.runPromise(
        checkPromotionCandidates().pipe(Effect.provide(layer))
      );
      if (opts.json) console.log(JSON.stringify({ ok: true, candidates }, null, 2));
      else if (!candidates.length) {
        console.log("No promotion candidates");
      } else {
        for (const c of candidates) {
          console.log(
            `  ${c.documentType} (${c.evidenceCount} sessions, ${(c.avgCriterionPassRate * 100).toFixed(1)}% avg CPR) → ${c.suggestedCQEPath}`
          );
        }
      }
      return 0;
    }
    const documentType = opts.documentType?.trim();
    const out = opts.out?.trim();
    if (!documentType || !out) {
      console.error(
        "Usage: clawql ontology meta promote --document-type TYPE --output DIR | --check"
      );
      return 1;
    }
    try {
      const result = await Effect.runPromise(
        promoteDocumentType(documentType, resolve(out)).pipe(Effect.provide(layer))
      );
      if (opts.json) console.log(JSON.stringify({ ok: true, result }, null, 2));
      else console.log(`Promoted ${documentType} → ${result.outputPath}`);
      return 0;
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      return 1;
    }
  }

  console.error("Usage: clawql ontology meta status | patterns | promote");
  return 1;
}
