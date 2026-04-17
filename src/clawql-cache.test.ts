import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  handleCacheToolInput,
  resetClawqlCacheForTests,
} from "./clawql-cache.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";

describe("handleCacheToolInput", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_CACHE_MAX_VALUE_BYTES = process.env.CLAWQL_CACHE_MAX_VALUE_BYTES;
    saved.CLAWQL_CACHE_MAX_ENTRIES = process.env.CLAWQL_CACHE_MAX_ENTRIES;
    resetClawqlCacheForTests();
  });

  afterEach(() => {
    resetClawqlCacheForTests();
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  });

  it("set get delete", async () => {
    await handleCacheToolInput({
      operation: "set",
      key: "k1",
      value: "v1",
    });
    const g = await handleCacheToolInput({ operation: "get", key: "k1" });
    const body = JSON.parse(g.content[0]!.text) as { hit: boolean; value?: string };
    expect(body.hit).toBe(true);
    expect(body.value).toBe("v1");

    const del = await handleCacheToolInput({ operation: "delete", key: "k1" });
    expect(JSON.parse(del.content[0]!.text)).toMatchObject({ deleted: true });

    const miss = await handleCacheToolInput({ operation: "get", key: "k1" });
    expect(JSON.parse(miss.content[0]!.text).hit).toBe(false);
  });

  it("list with prefix and search", async () => {
    await handleCacheToolInput({ operation: "set", key: "session:a", value: "1" });
    await handleCacheToolInput({ operation: "set", key: "session:b", value: "2" });
    await handleCacheToolInput({ operation: "set", key: "other", value: "3" });

    const list = await handleCacheToolInput({
      operation: "list",
      prefix: "session:",
      limit: 10,
    });
    const lj = JSON.parse(list.content[0]!.text) as { keys: string[] };
    expect(lj.keys.sort()).toEqual(["session:a", "session:b"]);

    const search = await handleCacheToolInput({
      operation: "search",
      query: "ssion:b",
      limit: 10,
    });
    const sj = JSON.parse(search.content[0]!.text) as { keys: string[] };
    expect(sj.keys).toEqual(["session:b"]);
  });

  it("rejects oversized values", async () => {
    vi.stubEnv("CLAWQL_CACHE_MAX_VALUE_BYTES", "10");
    resetClawqlCacheForTests();
    try {
      expect(getClawqlCacheMaxValueBytes()).toBe(10);
      const r = await handleCacheToolInput({
        operation: "set",
        key: "big",
        value: "x".repeat(20),
      });
      const j = JSON.parse(r.content[0]!.text) as { ok: boolean };
      expect(j.ok).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      resetClawqlCacheForTests();
    }
  });

  it("validates operation payloads", async () => {
    await expect(handleCacheToolInput({ operation: "set", key: "k" })).rejects.toThrow();
    await expect(handleCacheToolInput({ operation: "get" })).rejects.toThrow();
    await expect(handleCacheToolInput({ operation: "search" })).rejects.toThrow();
  });

  it("evicts LRU when at max entries", async () => {
    vi.stubEnv("CLAWQL_CACHE_MAX_ENTRIES", "3");
    resetClawqlCacheForTests();
    try {
      expect(getClawqlCacheMaxEntries()).toBe(3);
      await handleCacheToolInput({ operation: "set", key: "a", value: "1" });
      await handleCacheToolInput({ operation: "set", key: "b", value: "2" });
      await handleCacheToolInput({ operation: "set", key: "c", value: "3" });
      await handleCacheToolInput({ operation: "get", key: "b" });
      const r = await handleCacheToolInput({ operation: "set", key: "d", value: "4" });
      const j = JSON.parse(r.content[0]!.text) as { ok: boolean; evicted?: number };
      expect(j.ok).toBe(true);
      expect(j.evicted).toBe(1);
      const ga = await handleCacheToolInput({ operation: "get", key: "a" });
      expect(JSON.parse(ga.content[0]!.text).hit).toBe(false);
      const gb = await handleCacheToolInput({ operation: "get", key: "b" });
      expect(JSON.parse(gb.content[0]!.text).hit).toBe(true);
      const gd = await handleCacheToolInput({ operation: "get", key: "d" });
      expect(JSON.parse(gd.content[0]!.text).hit).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      resetClawqlCacheForTests();
    }
  });
});

describe("getClawqlOptionalToolFlags enableCache", () => {
  it("is false by default", () => {
    expect(getClawqlOptionalToolFlags({} as NodeJS.ProcessEnv).enableCache).toBe(false);
  });
});
