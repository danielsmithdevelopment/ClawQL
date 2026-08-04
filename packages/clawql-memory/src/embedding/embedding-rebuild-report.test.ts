import { afterEach, describe, expect, it } from "vitest";
import { embeddingRebuildReport } from "./embedding.js";

describe("embeddingRebuildReport", () => {
  const saved: Record<string, string | undefined> = {};

  function stash(keys: string[]) {
    for (const k of keys) saved[k] = process.env[k];
  }
  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  afterEach(() => {
    restore();
  });

  it("reports not synced when vector backend is off", () => {
    stash(["CLAWQL_MEMORY_DB", "CLAWQL_VECTOR_BACKEND", "CLAWQL_EMBEDDING_API_KEY", "OPENAI_API_KEY"]);
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_VECTOR_BACKEND;
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const r = embeddingRebuildReport();
    expect(r.synced).toBe(false);
    expect(r.skipped).toMatch(/VECTOR_BACKEND/i);
  });

  it("reports not synced when API key missing", () => {
    stash(["CLAWQL_MEMORY_DB", "CLAWQL_VECTOR_BACKEND", "CLAWQL_EMBEDDING_API_KEY", "OPENAI_API_KEY"]);
    delete process.env.CLAWQL_MEMORY_DB;
    process.env.CLAWQL_VECTOR_BACKEND = "sqlite";
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const r = embeddingRebuildReport();
    expect(r.synced).toBe(false);
    expect(r.skipped).toMatch(/EMBEDDING_API_KEY|OPENAI_API_KEY/i);
  });
});
