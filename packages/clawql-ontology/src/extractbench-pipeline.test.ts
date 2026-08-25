/**
 * ExtractBench ontology pipeline: scaffold → populate → ontology.db → recall.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { runExtractBenchOntologyPipeline } from "./shared/extractbench-pipeline.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

describe("runExtractBenchOntologyPipeline", () => {
  it("scaffolds invoice, populates all rows, recalls via ontology.db", async () => {
    const vault = await mkdtemp(join(tmpdir(), "clawql-eb-ont-"));
    tempDirs.push(vault);
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    process.env.CLAWQL_ONTOLOGY_META_MIN_EVIDENCE = "999";
    delete process.env.CLAWQL_ONTOLOGY_DB;

    const lineItems = Array.from({ length: 47 }, (_, i) => ({
      description: `Item ${i + 1}`,
      qty: i + 1,
    }));

    const result = await Effect.runPromise(
      runExtractBenchOntologyPipeline({
        vaultRoot: vault,
        documentType: "invoice",
        documentId: "inv-eb-1",
        jsonSchema: {
          title: "Invoice",
          type: "object",
          required: ["invoiceNumber"],
          properties: {
            invoiceNumber: { type: "string" },
            vendorName: { type: "string" },
            lineItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  qty: { type: "integer" },
                },
              },
            },
          },
        },
        extracted: {
          invoiceNumber: "INV-EB-1",
          vendorName: "Acme",
          lineItems,
        },
        limit: 10000,
      })
    );

    expect(result.scaffold.entityId).toBe("invoice");
    expect(result.rowsPopulated.lineItems).toBe(47);
    expect(result.populatedFields).toEqual(expect.arrayContaining(["invoiceNumber", "vendorName"]));
    expect(result.recall.ok).toBe(true);
    if (!result.recall.ok) return;
    expect(result.recall.filteredEntities).toBe(1);
    expect((result.recall.hits[0]?.fields.lineItems as unknown[])?.length).toBe(47);

    // Nested row enumeration (T1 completeness via ontology)
    const { runOntologyRecall } = await import("clawql-memory/ontology");
    const nested = await runOntologyRecall(vault, {
      query: "line items",
      schema: "invoice__lineItems_record",
      filters: {},
      limit: 10000,
    });
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;
    expect(nested.filteredEntities).toBe(47);
  });
});
