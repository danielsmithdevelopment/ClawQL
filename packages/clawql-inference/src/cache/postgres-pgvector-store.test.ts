import { describe, expect, it } from "vitest";
import { resolveSemanticCacheBackend } from "./postgres-pgvector-store.js";

describe("semantic cache backend", () => {
  it("defaults to postgres when inference database is configured", () => {
    expect(
      resolveSemanticCacheBackend({
        CLAWQL_INFERENCE_DATABASE_URL: "postgres://user:pass@localhost:5432/clawql",
      })
    ).toBe("postgres");
  });

  it("honors explicit memory backend", () => {
    expect(
      resolveSemanticCacheBackend({
        CLAWQL_INFERENCE_SEMANTIC_CACHE_BACKEND: "memory",
        CLAWQL_INFERENCE_DATABASE_URL: "postgres://user:pass@localhost:5432/clawql",
      })
    ).toBe("memory");
  });
});
