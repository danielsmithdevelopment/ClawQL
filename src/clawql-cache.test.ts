import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCacheToolInput, resetClawqlCacheForTests } from "./clawql-cache.js";

/**
 * MCP façade only — LRU / size / schema adversarial coverage lives in
 * `packages/clawql-core/src/cache/cache-service.test.ts` and `cache-input-schema.test.ts`.
 */
describe("handleCacheToolInput", () => {
  beforeEach(() => {
    resetClawqlCacheForTests();
  });

  afterEach(() => {
    resetClawqlCacheForTests();
  });

  it("returns JSON text content for set/get/delete", async () => {
    await handleCacheToolInput({
      operation: "set",
      key: "k1",
      value: "v1",
    });
    const g = await handleCacheToolInput({ operation: "get", key: "k1" });
    expect(g.content[0]?.type).toBe("text");
    const body = JSON.parse(g.content[0]!.text) as { hit: boolean; value?: string };
    expect(body.hit).toBe(true);
    expect(body.value).toBe("v1");

    const del = await handleCacheToolInput({ operation: "delete", key: "k1" });
    expect(JSON.parse(del.content[0]!.text)).toMatchObject({ deleted: true });
  });

  it("validates operation payloads before execution", async () => {
    await expect(handleCacheToolInput({ operation: "set", key: "k" })).rejects.toThrow();
    await expect(handleCacheToolInput({ operation: "get" })).rejects.toThrow();
    await expect(handleCacheToolInput({ operation: "search" })).rejects.toThrow();
  });
});
