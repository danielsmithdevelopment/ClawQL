/**
 * Dynamic Layer 2/3 ontology.db + structured memory_recall.
 */
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runOntologyRecall } from "./ontology-query.js";
import { syncDynamicOntologyDocument } from "./ontology-register.js";
import { matchDynamicFilters } from "./dynamic-filter.js";

describe("matchDynamicFilters", () => {
  it("supports isNull on arrays and numeric gte", () => {
    expect(
      matchDynamicFilters(
        { lineItems: [{ a: 1 }, { a: 2 }], totalAmount: 42 },
        { lineItems: { isNull: false }, totalAmount: { gte: 40 } }
      )
    ).toBe(true);
    expect(
      matchDynamicFilters({ lineItems: [], totalAmount: 42 }, { lineItems: { isNull: false } })
    ).toBe(false);
  });
});

describe("dynamic ontology recall", () => {
  let vault: string;
  const prevVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
  const prevOnt = process.env.CLAWQL_ONTOLOGY_DB;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), "clawql-dyn-ont-"));
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vault;
    delete process.env.CLAWQL_ONTOLOGY_DB;
    await mkdir(join(vault, "Memory"), { recursive: true });
  });

  afterEach(async () => {
    if (prevVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = prevVault;
    if (prevOnt === undefined) delete process.env.CLAWQL_ONTOLOGY_DB;
    else process.env.CLAWQL_ONTOLOGY_DB = prevOnt;
    await rm(vault, { recursive: true, force: true });
  });

  it("registers invoice entity and recalls all line-item parents", async () => {
    const synced = await syncDynamicOntologyDocument(
      vault,
      {
        id: "invoice",
        source: "json_schema",
        fields: [
          { name: "invoiceNumber", type: "string", nullable: false },
          { name: "totalAmount", type: "number", nullable: true },
        ],
        relationships: [
          { name: "lineItems", type: "repeated", targetEntity: "invoice__lineItems_record" },
        ],
        documentType: "invoice",
      },
      "doc-1",
      {
        id: "doc-1",
        invoiceNumber: "INV-100",
        totalAmount: 120,
        lineItems: [
          { id: "row_0", description: "Widget", qty: 2 },
          { id: "row_1", description: "Gadget", qty: 5 },
        ],
      },
      [
        {
          entityId: "invoice__lineItems_record",
          recordId: "doc-1:row_0",
          fields: { id: "row_0", description: "Widget", qty: 2 },
        },
        {
          entityId: "invoice__lineItems_record",
          recordId: "doc-1:row_1",
          fields: { id: "row_1", description: "Gadget", qty: 5 },
        },
      ]
    );
    expect(synced.ok).toBe(true);

    const result = await runOntologyRecall(vault, {
      query: "invoice line items",
      schema: "invoice",
      filters: { lineItems: { isNull: false } },
      limit: 10000,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filteredEntities).toBe(1);
    expect(result.hits[0]?.fields.invoiceNumber).toBe("INV-100");
    expect((result.hits[0]?.fields.lineItems as unknown[])?.length).toBe(2);

    const rows = await runOntologyRecall(vault, {
      query: "line item rows",
      schema: "invoice__lineItems_record",
      filters: {},
      limit: 10000,
    });
    // Nested entity stub may lack field defs — register full nested entity for filter validation
    // Empty filters still allowed for dynamic schemas once entity exists (stub has no fields)
    expect(rows.ok).toBe(true);
    if (!rows.ok) return;
    expect(rows.filteredEntities).toBe(2);
  });
});
