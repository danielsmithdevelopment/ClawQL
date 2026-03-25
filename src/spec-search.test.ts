import { describe, expect, it } from "vitest";
import { formatSearchResults, searchOperations } from "./spec-search.js";
import type { Operation } from "./spec-loader.js";

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

  it("formats empty results with helpful message", () => {
    const text = formatSearchResults([]);
    const json = JSON.parse(text) as { results: unknown[]; message: string };
    expect(json.results).toEqual([]);
    expect(json.message).toContain("No matching operations found");
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
