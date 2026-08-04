import { afterEach, describe, expect, it } from "vitest";
import {
  embeddingRebuildReport,
  embedTexts,
  resolveEmbeddingConfig,
  setLocalEmbeddingOverrideForTests,
  vectorBackend,
} from "./embedding.js";

describe("embeddingRebuildReport + local provider", () => {
  const saved: Record<string, string | undefined> = {};

  function stash(keys: string[]) {
    for (const k of keys) saved[k] = process.env[k];
  }
  function restore() {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    setLocalEmbeddingOverrideForTests(null);
  }

  afterEach(() => {
    restore();
  });

  it("defaults vector backend to sqlite", () => {
    stash(["CLAWQL_VECTOR_BACKEND"]);
    delete process.env.CLAWQL_VECTOR_BACKEND;
    expect(vectorBackend()).toBe("sqlite");
  });

  it("reports not synced when vector backend is off", () => {
    stash(["CLAWQL_MEMORY_DB", "CLAWQL_VECTOR_BACKEND", "CLAWQL_EMBEDDING_PROVIDER"]);
    delete process.env.CLAWQL_MEMORY_DB;
    process.env.CLAWQL_VECTOR_BACKEND = "off";
    const r = embeddingRebuildReport();
    expect(r.synced).toBe(false);
    expect(r.skipped).toMatch(/VECTOR_BACKEND=off/i);
  });

  it("resolves local provider without API key when vault is set", () => {
    stash([
      "CLAWQL_MEMORY_DB",
      "CLAWQL_VECTOR_BACKEND",
      "CLAWQL_EMBEDDING_PROVIDER",
      "CLAWQL_EMBEDDING_API_KEY",
      "OPENAI_API_KEY",
      "CLAWQL_OBSIDIAN_VAULT_PATH",
    ]);
    delete process.env.CLAWQL_MEMORY_DB;
    delete process.env.CLAWQL_VECTOR_BACKEND;
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/clawql-vault-test";
    const cfg = resolveEmbeddingConfig();
    expect(cfg?.provider).toBe("local");
    expect(cfg?.model).toContain("MiniLM");
    expect(embeddingRebuildReport().synced).toBe(true);
  });

  it("embeds via injectable local pipeline (no model download)", async () => {
    stash([
      "CLAWQL_MEMORY_DB",
      "CLAWQL_VECTOR_BACKEND",
      "CLAWQL_EMBEDDING_PROVIDER",
      "CLAWQL_OBSIDIAN_VAULT_PATH",
      "CLAWQL_EMBEDDING_API_KEY",
      "OPENAI_API_KEY",
    ]);
    delete process.env.CLAWQL_EMBEDDING_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = "/tmp/clawql-vault-test";
    process.env.CLAWQL_EMBEDDING_PROVIDER = "local";

    setLocalEmbeddingOverrideForTests(async (texts) =>
      texts.map((_, i) => Float32Array.from([i + 1, 0, 0, 1]))
    );

    const cfg = resolveEmbeddingConfig();
    expect(cfg?.provider).toBe("local");
    const { vectors, dimension } = await embedTexts(["a", "b"], cfg!);
    expect(vectors).toHaveLength(2);
    expect(dimension).toBe(4);
    expect(vectors[0]![0]).toBe(1);
    expect(vectors[1]![0]).toBe(2);
  });
});
