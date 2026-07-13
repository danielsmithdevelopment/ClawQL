import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import {
  CacheService,
  CacheTestLayer,
  cacheOperationProgram,
  createCacheTestLayer,
} from "./cache-service.js";
import { getClawqlCacheMaxEntries } from "./config.js";
import { resetDefaultLruCacheStoreForTests } from "./lru-store.js";

const run = <A, E>(program: Effect.Effect<A, E, CacheService>) =>
  Effect.runPromise(program.pipe(Effect.provide(CacheTestLayer)));

describe("CacheService (Effect)", () => {
  afterEach(() => {
    resetDefaultLruCacheStoreForTests();
  });

  it("set get delete via Effect Layer", async () => {
    await run(
      Effect.gen(function* () {
        const cache = yield* CacheService;
        yield* cache.execute({ operation: "set", key: "k1", value: "v1" });
        const hit = yield* cache.execute({ operation: "get", key: "k1" });
        expect(hit).toMatchObject({ ok: true, hit: true, value: "v1" });
        const del = yield* cache.execute({ operation: "delete", key: "k1" });
        expect(del).toMatchObject({ deleted: true });
        const miss = yield* cache.execute({ operation: "get", key: "k1" });
        expect(miss).toMatchObject({ hit: false });
      })
    );
  });

  it("list with prefix and search", async () => {
    const list = await run(
      Effect.gen(function* () {
        const cache = yield* CacheService;
        yield* cache.execute({ operation: "set", key: "session:a", value: "1" });
        yield* cache.execute({ operation: "set", key: "session:b", value: "2" });
        yield* cache.execute({ operation: "set", key: "other", value: "3" });
        const listed = yield* cacheOperationProgram({
          operation: "list",
          prefix: "session:",
          limit: 10,
        });
        const searched = yield* cacheOperationProgram({
          operation: "search",
          query: "ssion:b",
          limit: 10,
        });
        return { listed, searched };
      })
    );
    expect(list.listed).toMatchObject({ keys: ["session:a", "session:b"] });
    expect(list.searched).toMatchObject({ keys: ["session:b"] });
  });

  it("rejects oversized values", async () => {
    const smallValueLayer = createCacheTestLayer(
      () => 10,
      () => 10_000
    );
    const runSmall = <A, E>(program: Effect.Effect<A, E, CacheService>) =>
      Effect.runPromise(program.pipe(Effect.provide(smallValueLayer)));

    const result = await runSmall(
      cacheOperationProgram({
        operation: "set",
        key: "big",
        value: "x".repeat(20),
      })
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("evicts LRU when at max entries", async () => {
    const smallLayer = createCacheTestLayer(
      () => 1024 * 1024,
      () => 3
    );
    const runSmall = <A, E>(program: Effect.Effect<A, E, CacheService>) =>
      Effect.runPromise(program.pipe(Effect.provide(smallLayer)));

    const store = await runSmall(
      Effect.gen(function* () {
        const cache = yield* CacheService;
        yield* cache.execute({ operation: "set", key: "a", value: "1" });
        yield* cache.execute({ operation: "set", key: "b", value: "2" });
        yield* cache.execute({ operation: "set", key: "c", value: "3" });
        yield* cache.execute({ operation: "get", key: "b" });
        const setD = yield* cache.execute({ operation: "set", key: "d", value: "4" });
        const ga = yield* cache.execute({ operation: "get", key: "a" });
        const gb = yield* cache.execute({ operation: "get", key: "b" });
        const gd = yield* cache.execute({ operation: "get", key: "d" });
        return { setD, ga, gb, gd };
      })
    );
    expect(store.setD).toMatchObject({ ok: true, evicted: 1 });
    expect(store.ga).toMatchObject({ hit: false });
    expect(store.gb).toMatchObject({ hit: true });
    expect(store.gd).toMatchObject({ hit: true });
  });

  it("getClawqlCacheMaxEntries respects env", () => {
    const saved = process.env.CLAWQL_CACHE_MAX_ENTRIES;
    process.env.CLAWQL_CACHE_MAX_ENTRIES = "42";
    expect(getClawqlCacheMaxEntries()).toBe(42);
    if (saved === undefined) delete process.env.CLAWQL_CACHE_MAX_ENTRIES;
    else process.env.CLAWQL_CACHE_MAX_ENTRIES = saved;
  });
});
