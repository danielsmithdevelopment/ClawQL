import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  managedOrgId,
  readManagedDataSource,
  resolveWithFallbackEffect,
} from "./data-source";

describe("managed data source", () => {
  it("defaults to auto", () => {
    expect(readManagedDataSource({})).toBe("auto");
  });

  it("reads CLAWQL_MANAGED_DATA_SOURCE", () => {
    expect(readManagedDataSource({ CLAWQL_MANAGED_DATA_SOURCE: "live" })).toBe("live");
    expect(readManagedDataSource({ CLAWQL_MANAGED_DATA_SOURCE: "FIXTURE" })).toBe("fixture");
  });

  it("prefers CLAWQL_MANAGED_ORG_ID", () => {
    expect(
      managedOrgId({
        CLAWQL_MANAGED_ORG_ID: "org_a",
        NEXT_PUBLIC_CLAWQL_MANAGED_ORG_ID: "org_b",
      }),
    ).toBe("org_a");
  });

  it("uses fixture when source is fixture", async () => {
    const result = await Effect.runPromise(
      resolveWithFallbackEffect({
        source: "fixture",
        live: Effect.succeed(["live"]),
        fixture: ["fixture"],
        isLiveUseful: (v) => v.length > 0,
      }),
    );
    expect(result).toEqual({ data: ["fixture"], source: "fixture" });
  });

  it("falls back when live fails in auto (non-production)", async () => {
    const result = await Effect.runPromise(
      resolveWithFallbackEffect({
        source: "auto",
        live: Effect.fail(new Error("boom")),
        fixture: ["fixture"],
        empty: [],
        env: { NODE_ENV: "development" },
        isLiveUseful: (v) => v.length > 0,
      }),
    );
    expect(result).toEqual({ data: ["fixture"], source: "fixture" });
  });

  it("does not serve Acme fixture when live fails in production auto", async () => {
    const result = await Effect.runPromise(
      resolveWithFallbackEffect({
        source: "auto",
        live: Effect.fail(new Error("boom")),
        fixture: ["fixture"],
        empty: [],
        env: { NODE_ENV: "production" },
        isLiveUseful: (v) => v.length > 0,
      }),
    );
    expect(result).toEqual({ data: [], source: "live" });
  });

  it("maps production auto to live", () => {
    expect(readManagedDataSource({ NODE_ENV: "production" })).toBe("live");
    expect(
      readManagedDataSource({ NODE_ENV: "production", CLAWQL_MANAGED_DATA_SOURCE: "auto" }),
    ).toBe("live");
  });

  it("keeps live when useful in auto", async () => {
    const result = await Effect.runPromise(
      resolveWithFallbackEffect({
        source: "auto",
        live: Effect.succeed(["live"]),
        fixture: ["fixture"],
        isLiveUseful: (v) => v[0] === "live",
      }),
    );
    expect(result).toEqual({ data: ["live"], source: "live" });
  });

  it("falls back when live is empty in auto (non-production)", async () => {
    const result = await Effect.runPromise(
      resolveWithFallbackEffect({
        source: "auto",
        live: Effect.succeed([] as string[]),
        fixture: ["fixture"],
        empty: [],
        env: { NODE_ENV: "development" },
        isLiveUseful: (v) => v.length > 0,
      }),
    );
    expect(result).toEqual({ data: ["fixture"], source: "fixture" });
  });
});
