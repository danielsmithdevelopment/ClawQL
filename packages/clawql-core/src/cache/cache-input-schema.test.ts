import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { decodeCacheInput } from "./cache-input-schema.js";

describe("CacheInputSchema", () => {
  it("decodes set/get/search variants", async () => {
    await expect(
      Effect.runPromise(decodeCacheInput({ operation: "set", key: "k", value: "v" }))
    ).resolves.toEqual({ operation: "set", key: "k", value: "v" });
    await expect(
      Effect.runPromise(decodeCacheInput({ operation: "get", key: "k" }))
    ).resolves.toEqual({ operation: "get", key: "k" });
    await expect(
      Effect.runPromise(decodeCacheInput({ operation: "search", query: "ab" }))
    ).resolves.toEqual({ operation: "search", query: "ab" });
  });

  it("rejects set without value and empty key", async () => {
    await expect(
      Effect.runPromise(decodeCacheInput({ operation: "set", key: "k" }))
    ).rejects.toThrow();
    await expect(
      Effect.runPromise(decodeCacheInput({ operation: "get", key: "" }))
    ).rejects.toThrow();
  });
});
