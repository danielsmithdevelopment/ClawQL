/**
 * Three-layer meta-ontology — Layer 2 scaffold + Layer 3 learning/promotion.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { OntologyIndexService, makeOntologyIndexLive } from "./shared/ontology-index.js";
import { scaffoldFromJsonSchema } from "./layer2/scaffold/json-schema.js";
import { scaffoldFromDocling } from "./layer2/scaffold/document-structure.js";
import { populateFromDocling } from "./layer2/scaffold/populate.js";
import { metaStoreLayerForPath } from "./layer3/meta/store.js";
import { ingestOBTTrace, extractOntologyEvidence } from "./layer3/meta/trace-ingester.js";
import { scaffoldWithMeta, mergeWithSchema } from "./layer3/meta/meta-scaffold.js";
import { checkPromotionCandidates, promoteDocumentType } from "./layer3/meta/promote.js";
import { readOntologyMetaConfigSync } from "./effect/ontology-meta-config.js";
import type { CQEEntity, JSONSchema } from "./shared/cqe-runtime-types.js";
import type { OBTRecord } from "./layer3/meta/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(d);
  return d;
}

const invoiceSchema: JSONSchema = {
  title: "Invoice",
  type: "object",
  required: ["invoiceNumber", "vendorName"],
  properties: {
    invoiceNumber: { type: "string", description: "Invoice #" },
    vendorName: { type: "string" },
    totalAmount: { type: "number" },
    issuedAt: { type: "string", format: "date" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          qty: { type: "integer" },
          unitPrice: { type: "number" },
        },
        required: ["description"],
      },
    },
  },
};

describe("Layer 2 JSON Schema scaffold", () => {
  it("scaffolds fields and repeated relationships", async () => {
    const indexLayer = makeOntologyIndexLive();
    const result = await Effect.runPromise(
      scaffoldFromJsonSchema(invoiceSchema, {
        documentType: "invoice",
        ttl: "session",
        overwrite: true,
      }).pipe(Effect.provide(indexLayer))
    );
    expect(result.entityId).toBe("invoice");
    expect(result.fieldCount).toBeGreaterThanOrEqual(3);
    expect(result.relationshipCount).toBe(1);
    expect(result.entity.relationships[0]?.name).toBe("lineItems");
    expect(result.entity.fields.find((f) => f.name === "issuedAt")?.type).toBe("ISODate");

    const nested = await Effect.runPromise(
      Effect.gen(function* () {
        const index = yield* OntologyIndexService;
        return yield* index.getEntity(result.entity.relationships[0]!.targetEntity);
      }).pipe(Effect.provide(indexLayer))
    );
    expect(nested?.fields.map((f) => f.name)).toContain("description");
  });
});

describe("Layer 2 Docling scaffold + populate", () => {
  it("populates all table rows (T1 completeness)", async () => {
    const indexLayer = makeOntologyIndexLive();
    const program = Effect.gen(function* () {
      const scaffold = yield* scaffoldFromDocling(
        {
          title: "Energy Form",
          formFields: [
            { label: "Facility Name", value: "Plant A" },
            { label: "Permit ID", value: "P-100" },
          ],
          tables: [
            {
              index: 0,
              headers: [{ text: "Item" }, { text: "Qty" }],
              rows: [
                ["Valve", 2],
                ["Pipe", 40],
                ["Gasket", 12],
              ],
            },
          ],
        },
        { entityId: "energy_form", ttl: "session", overwrite: true }
      );
      const populated = yield* populateFromDocling(
        {
          formFields: [
            { label: "Facility Name", value: "Plant A" },
            { label: "Permit ID", value: "P-100" },
          ],
          tables: [
            {
              index: 0,
              headers: [{ text: "Item" }, { text: "Qty" }],
              rows: [
                ["Valve", 2],
                ["Pipe", 40],
                ["Gasket", 12],
              ],
            },
          ],
        },
        scaffold.entity,
        "doc-1"
      );
      const index = yield* OntologyIndexService;
      const record = yield* index.getRecord("energy_form", "doc-1");
      const nestedRows = yield* index.listRecords(scaffold.entity.relationships[0]!.targetEntity);
      return { scaffold, populated, record, nestedRows };
    });

    const out = await Effect.runPromise(program.pipe(Effect.provide(indexLayer)));
    expect(out.populated.populatedFields).toEqual(
      expect.arrayContaining(["facility_name", "permit_id"])
    );
    expect(out.populated.rowsPopulated.table_0).toBe(3);
    expect((out.record?.table_0 as unknown[])?.length).toBe(3);
    expect(out.nestedRows).toHaveLength(3);
  });
});

describe("Layer 3 meta store + ingest", () => {
  it("learns entities from OBT traces and scaffolds with meta", async () => {
    const dir = await tempDir("clawql-meta-");
    const dbPath = join(dir, "meta-ontology.db");
    process.env.CLAWQL_ONTOLOGY_META_MIN_EVIDENCE = "2";
    process.env.CLAWQL_ONTOLOGY_META_PROMOTION_EVIDENCE = "2";
    process.env.CLAWQL_ONTOLOGY_META_PROMOTION_QUALITY = "0.8";

    const entity: CQEEntity = {
      id: "invoice",
      source: "json_schema_cold",
      fields: [
        { name: "invoiceNumber", type: "string", nullable: false },
        { name: "vendorName", type: "string", nullable: false },
      ],
      relationships: [],
      documentType: "invoice",
    };

    const obt: OBTRecord = {
      verdict: { criterionPassRate: 0.9 },
      taskMeta: {
        documentType: "invoice",
        entityId: "invoice",
        scaffoldedEntity: entity,
      },
      rtp: {
        turnSequence: [
          {
            execution: {
              toolName: "memory_recall",
              payload: {
                schema: "invoice",
                filters: { lineItems: { isNull: false } },
              },
              result: {
                filteredEntities: 24,
                queryType: "structured_predicate",
                hits: [
                  {
                    confidence: "EXTRACTED",
                    fields: { invoiceNumber: "INV-1", vendorName: "Acme" },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    const evidence = extractOntologyEvidence(obt);
    expect(evidence.queryObservations).toHaveLength(1);
    expect(evidence.fieldObservations.length).toBeGreaterThan(0);

    const layer = Layer.merge(makeOntologyIndexLive(), metaStoreLayerForPath(dbPath));

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* ingestOBTTrace(obt);
        yield* ingestOBTTrace(obt);
      }).pipe(Effect.provide(layer))
    );

    const scaffold = await Effect.runPromise(
      scaffoldWithMeta(invoiceSchema, "invoice", { overwrite: true }).pipe(Effect.provide(layer))
    );
    expect(scaffold.source).toBe("meta_ontology");
    expect(scaffold.evidenceCount).toBeGreaterThanOrEqual(2);

    const candidates = await Effect.runPromise(
      checkPromotionCandidates().pipe(Effect.provide(metaStoreLayerForPath(dbPath)))
    );
    expect(candidates.some((c) => c.documentType === "invoice")).toBe(true);

    const outDir = join(dir, "packs", "invoice");
    const promoted = await Effect.runPromise(
      promoteDocumentType("invoice", outDir).pipe(Effect.provide(metaStoreLayerForPath(dbPath)))
    );
    expect(promoted.outputPath).toContain("entity.cqe");
    expect(promoted.yaml).toContain("apiVersion: clawql.dev/ontology/v1alpha1");
    expect(promoted.yaml).toContain("invoiceNumber");
  });
});

describe("mergeWithSchema", () => {
  it("adds new schema fields onto learned entity", () => {
    const learned: CQEEntity = {
      id: "invoice",
      source: "meta_ontology",
      fields: [{ name: "invoiceNumber", type: "string", nullable: false }],
      relationships: [],
    };
    const merged = mergeWithSchema(learned, {
      properties: {
        invoiceNumber: { type: "string" },
        poNumber: { type: "string" },
      },
      required: ["invoiceNumber"],
    });
    expect(merged.fields.map((f) => f.name).sort()).toEqual(["invoiceNumber", "poNumber"]);
  });
});

describe("meta config", () => {
  it("reads env defaults", () => {
    const cfg = readOntologyMetaConfigSync({
      CLAWQL_ONTOLOGY_SCAFFOLD_ENABLED: "1",
      CLAWQL_ONTOLOGY_META_MIN_EVIDENCE: "15",
    });
    expect(cfg.scaffoldEnabled).toBe(true);
    expect(cfg.minEvidence).toBe(15);
  });
});

describe("CLI scaffold smoke", () => {
  it("writes schema file and scaffolds via library", async () => {
    const dir = await tempDir("clawql-scaffold-cli-");
    const schemaPath = join(dir, "invoice-schema.json");
    await writeFile(schemaPath, JSON.stringify(invoiceSchema), "utf8");
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(schemaPath, "utf8"));
    const result = await Effect.runPromise(
      scaffoldFromJsonSchema(raw, { overwrite: true }).pipe(Effect.provide(makeOntologyIndexLive()))
    );
    expect(result.entityId).toBe("invoice");
  });
});
