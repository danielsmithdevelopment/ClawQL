import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { decodeMemoryIngestInput, decodeMemoryRecallInput } from "./memory-input-schema.js";

describe("MemoryIngestInputSchema", () => {
  it("decodes title and nested rebuild / citations", async () => {
    const decoded = await Effect.runPromise(
      decodeMemoryIngestInput({
        title: "Notes",
        type: "decision",
        description: "Summary",
        tags: ["okf"],
        correlationId: "c1",
        insights: "ok",
        enterpriseCitations: [{ title: "A", url: "https://example.com" }],
        rebuild: { pageindex: true, embeddings: false },
        toolOutputs: ["a", "b"],
      })
    );
    expect(decoded).toEqual({
      title: "Notes",
      type: "decision",
      description: "Summary",
      tags: ["okf"],
      correlationId: "c1",
      insights: "ok",
      enterpriseCitations: [{ title: "A", url: "https://example.com" }],
      rebuild: { pageindex: true, embeddings: false },
      toolOutputs: ["a", "b"],
    });
  });

  it("rejects empty title", async () => {
    await expect(Effect.runPromise(decodeMemoryIngestInput({ title: "" }))).rejects.toThrow();
  });
});

describe("MemoryRecallInputSchema", () => {
  it("decodes sources enum array", async () => {
    const decoded = await Effect.runPromise(
      decodeMemoryRecallInput({
        query: "vault notes",
        sources: ["vault", "vector"],
        limit: 5,
      })
    );
    expect(decoded).toEqual({
      query: "vault notes",
      sources: ["vault", "vector"],
      limit: 5,
    });
  });

  it("rejects empty query and empty sources", async () => {
    await expect(Effect.runPromise(decodeMemoryRecallInput({ query: "" }))).rejects.toThrow();
    await expect(
      Effect.runPromise(decodeMemoryRecallInput({ query: "x", sources: [] }))
    ).rejects.toThrow();
  });

  it("decodes structured ontology schema + filters", async () => {
    const decoded = await Effect.runPromise(
      decodeMemoryRecallInput({
        query: "escrow matters",
        schema: "legal.Matter",
        filters: { escrowPct: { gte: 10 }, nonCompeteMonths: { gt: 18 } },
        confidenceMinimum: "EXTRACTED",
      })
    );
    expect(decoded.schema).toBe("legal.Matter");
    expect(decoded.filters).toEqual({
      escrowPct: { gte: 10 },
      nonCompeteMonths: { gt: 18 },
    });
    expect(decoded.confidenceMinimum).toBe("EXTRACTED");
  });
});
