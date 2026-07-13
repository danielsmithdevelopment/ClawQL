import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ConfigService, createConfigTestLayer } from "./config-service.js";
import {
  getClawqlAuditMaxEntries,
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  isClawqlCuckooMetricsEnabled,
  parseBoundedInt,
} from "./env.js";

const runWithEnv = <A, E>(env: NodeJS.ProcessEnv, program: Effect.Effect<A, E, ConfigService>) =>
  Effect.runPromise(program.pipe(Effect.provide(createConfigTestLayer(env))));

describe("ConfigService (Effect)", () => {
  it("exposes audit, cache, and cuckoo settings from env", async () => {
    const env = {
      CLAWQL_AUDIT_MAX_ENTRIES: "42",
      CLAWQL_CACHE_MAX_VALUE_BYTES: "2048",
      CLAWQL_CACHE_MAX_ENTRIES: "99",
      CLAWQL_CUCKOO_METRICS: "1",
    };

    const snapshot = await runWithEnv(
      env,
      Effect.gen(function* () {
        const config = yield* ConfigService;
        return {
          audit: config.getAuditMaxEntries(),
          cacheBytes: config.getCacheMaxValueBytes(),
          cacheEntries: config.getCacheMaxEntries(),
          cuckoo: config.isCuckooMetricsEnabled(),
        };
      })
    );

    expect(snapshot).toEqual({
      audit: 42,
      cacheBytes: 2048,
      cacheEntries: 99,
      cuckoo: true,
    });
  });

  it("re-reads env on each accessor", async () => {
    const env: NodeJS.ProcessEnv = { CLAWQL_AUDIT_MAX_ENTRIES: "10" };
    const audit = await runWithEnv(
      env,
      Effect.gen(function* () {
        const config = yield* ConfigService;
        return config.getAuditMaxEntries();
      })
    );
    expect(audit).toBe(10);
    env.CLAWQL_AUDIT_MAX_ENTRIES = "20";
    const audit2 = await runWithEnv(
      env,
      Effect.gen(function* () {
        const config = yield* ConfigService;
        return config.getAuditMaxEntries();
      })
    );
    expect(audit2).toBe(20);
  });
});

describe("env parsers", () => {
  it("parseBoundedInt clamps and falls back", () => {
    expect(parseBoundedInt(undefined, 5, 1, 10)).toBe(5);
    expect(parseBoundedInt("nope", 5, 1, 10)).toBe(5);
    expect(parseBoundedInt("3", 5, 1, 10)).toBe(3);
    expect(parseBoundedInt("0", 5, 1, 10)).toBe(1);
    expect(parseBoundedInt("99", 5, 1, 10)).toBe(10);
  });

  it("standalone getters respect env", () => {
    const env = {
      CLAWQL_AUDIT_MAX_ENTRIES: "42",
      CLAWQL_CACHE_MAX_VALUE_BYTES: "10",
      CLAWQL_CACHE_MAX_ENTRIES: "3",
      CLAWQL_CUCKOO_METRICS: "1",
    };
    expect(getClawqlAuditMaxEntries(env)).toBe(42);
    expect(getClawqlCacheMaxValueBytes(env)).toBe(10);
    expect(getClawqlCacheMaxEntries(env)).toBe(3);
    expect(isClawqlCuckooMetricsEnabled(env)).toBe(true);
  });
});
