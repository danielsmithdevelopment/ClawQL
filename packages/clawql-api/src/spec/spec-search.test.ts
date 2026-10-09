import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildSearchCatalogMeta,
  formatSearchResults,
  formatSearchResultsEffect,
  mergeRankedHitsWithCatalogEffect,
  searchOperations,
} from "./spec-search.js";
import type { Operation } from "./operation-types.js";

const baseOp = {
  method: "GET",
  path: "v1/services",
  flatPath: "v1/services",
  resource: "services",
  parameters: {},
} satisfies Partial<Operation>;

describe("spec-search", () => {
  it("ranks closer operation intent first", () => {
    const operations: Operation[] = [
      {
        ...baseOp,
        id: "run.projects.locations.services.get",
        description: "Get a service",
      } as Operation,
      {
        ...baseOp,
        method: "DELETE",
        id: "run.projects.locations.services.delete",
        description: "Delete a service",
      } as Operation,
    ];

    const out = searchOperations(operations, "delete service", 2);
    expect(out.length).toBe(2);
    expect(out[0].operation.id).toBe("run.projects.locations.services.delete");
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("formats empty results with helpful message and COMPLETE catalog", () => {
    const text = formatSearchResults([]);
    const json = JSON.parse(text) as {
      results: unknown[];
      message: string;
      catalogStatus: string;
      matchedCount: number;
      totalCount: number;
    };
    expect(json.results).toEqual([]);
    expect(json.message).toContain("No matching operations or skills found");
    expect(json.catalogStatus).toBe("complete");
    expect(json.matchedCount).toBe(0);
    expect(json.totalCount).toBe(0);
  });

  it("respects limit when returning results", () => {
    const operations: Operation[] = Array.from({ length: 20 }, (_, i) => ({
      ...baseOp,
      id: `svc.op${i}`,
      description: `operation number ${i} widget`,
    })) as Operation[];
    const out = searchOperations(operations, "widget", 7);
    expect(out.length).toBe(7);
  });

  it("reports PARTIAL catalog when limit truncates matches", async () => {
    const operations: Operation[] = Array.from({ length: 20 }, (_, i) => ({
      ...baseOp,
      id: `svc.op${i}`,
      description: `operation number ${i} widget`,
    })) as Operation[];
    const all = searchOperations(operations, "widget", Number.POSITIVE_INFINITY);
    expect(all.length).toBe(20);
    const { hits, catalog } = await Effect.runPromise(mergeRankedHitsWithCatalogEffect(all, [], 5));
    expect(hits).toHaveLength(5);
    expect(catalog.catalogStatus).toBe("partial");
    expect(catalog.matchedCount).toBe(5);
    expect(catalog.totalCount).toBe(20);
    expect(catalog.message).toBe("PARTIAL, 5 of 20");
    expect(catalog.countsBySource).toEqual({ operation: 20, skill: 0 });

    const formatted = await Effect.runPromise(formatSearchResultsEffect(hits, catalog));
    const json = JSON.parse(formatted) as {
      catalogStatus: string;
      matchedCount: number;
      totalCount: number;
      message: string;
      results: unknown[];
      countsBySource: { operation: number; skill: number };
    };
    expect(json.catalogStatus).toBe("partial");
    expect(json.message).toBe("PARTIAL, 5 of 20");
    expect(json.results).toHaveLength(5);
    expect(json.countsBySource.operation).toBe(20);
  });

  it("reports COMPLETE when all matches fit the limit", () => {
    const operations: Operation[] = Array.from({ length: 3 }, (_, i) => ({
      ...baseOp,
      id: `svc.op${i}`,
      description: `operation number ${i} widget`,
    })) as Operation[];
    const all = searchOperations(operations, "widget", Number.POSITIVE_INFINITY);
    const catalog = buildSearchCatalogMeta(all.length, all.length, {
      operation: all.length,
      skill: 0,
    });
    expect(catalog.catalogStatus).toBe("complete");
    expect(catalog.message).toBe("COMPLETE");
    const json = JSON.parse(formatSearchResults(all, catalog)) as {
      catalogStatus: string;
      results: unknown[];
    };
    expect(json.catalogStatus).toBe("complete");
    expect(json.results).toHaveLength(3);
  });

  it("boosts score when query term matches specLabel", () => {
    const operations: Operation[] = [
      {
        ...baseOp,
        id: "cloud.generic.list",
        description: "list something generic",
        specLabel: "slack",
      } as Operation,
      {
        ...baseOp,
        id: "other.vendor.list",
        description: "slack incoming message webhook documentation",
        specLabel: "cloudflare",
      } as Operation,
    ];
    const out = searchOperations(operations, "slack", 2);
    expect(out[0].operation.specLabel).toBe("slack");
  });
});
