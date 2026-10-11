import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { LoadedSpec } from "../spec/spec-loader.js";
import { SearchService } from "../search-service.js";
import type { Operation } from "../spec/operation-types.js";
import { searchClawqlOperations, searchClawqlOperationsEffect } from "./search-core.js";
import { makeSearchLive } from "./search-live.js";

const baseOp = {
  method: "GET",
  path: "v1/services",
  flatPath: "v1/services",
  resource: "services",
  parameters: {},
} satisfies Partial<Operation>;

const stubOpenapi = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  paths: {},
  components: { schemas: {} },
} as const;

const stubSpec = (): Promise<LoadedSpec> =>
  Promise.resolve({
    operations: [
      {
        ...baseOp,
        id: "run.projects.locations.services.delete",
        method: "DELETE",
        description: "Delete a service",
      } as Operation,
    ],
    rawSource: {},
    openapi: stubOpenapi,
    multi: false,
  });

const manyWidgetSpec = (): Promise<LoadedSpec> =>
  Promise.resolve({
    operations: Array.from({ length: 12 }, (_, i) => ({
      ...baseOp,
      id: `svc.widget${i}`,
      description: `widget operation ${i}`,
    })) as Operation[],
    rawSource: {},
    openapi: stubOpenapi,
    multi: false,
  });

describe("searchClawqlOperationsEffect", () => {
  it("returns formatted search results", async () => {
    const output = await Effect.runPromise(
      searchClawqlOperationsEffect({ query: "delete service", limit: 3 }, stubSpec)
    );
    const parsed = JSON.parse(output.formattedText) as {
      results: { id: string }[];
      catalogStatus: string;
      message: string;
    };
    expect(parsed.results[0]?.id).toBe("run.projects.locations.services.delete");
    expect(parsed.catalogStatus).toBe("complete");
    expect(parsed.message).toBe("COMPLETE");
  });

  it("marks PARTIAL when limit truncates the catalog", async () => {
    const output = await Effect.runPromise(
      searchClawqlOperationsEffect({ query: "widget", limit: 3 }, manyWidgetSpec)
    );
    const parsed = JSON.parse(output.formattedText) as {
      catalogStatus: string;
      matchedCount: number;
      totalCount: number;
      message: string;
      results: unknown[];
      countsBySource: { operation: number; skill: number; doc: number };
    };
    expect(parsed.catalogStatus).toBe("partial");
    expect(parsed.matchedCount).toBe(3);
    expect(parsed.totalCount).toBeGreaterThanOrEqual(12);
    expect(parsed.message).toMatch(/^PARTIAL, 3 of /);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.countsBySource.operation).toBe(12);
  });

  it("includes kind:doc hits when docs index is available", async () => {
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/docs-index.json");
    const prev = process.env.CLAWQL_DOCS_INDEX_PATH;
    process.env.CLAWQL_DOCS_INDEX_PATH = fixture;
    try {
      const output = await Effect.runPromise(
        searchClawqlOperationsEffect(
          { query: "program mode information-flow", limit: 10 },
          stubSpec
        )
      );
      const parsed = JSON.parse(output.formattedText) as {
        results: { kind: string; title?: string }[];
        countsBySource: { doc: number };
      };
      expect(parsed.countsBySource.doc).toBeGreaterThan(0);
      expect(parsed.results.some((r) => r.kind === "doc")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_DOCS_INDEX_PATH;
      else process.env.CLAWQL_DOCS_INDEX_PATH = prev;
    }
  });

  it("promise boundary matches Effect program output", async () => {
    const params = { query: "delete", limit: 5 };
    const fromEffect = await Effect.runPromise(searchClawqlOperationsEffect(params, stubSpec));
    const fromPromise = await searchClawqlOperations(params, stubSpec);
    expect(fromPromise).toEqual(fromEffect);
  });
});

describe("makeSearchLive", () => {
  it("wires SearchService to native Effect.gen pipeline", async () => {
    const layer = makeSearchLive(stubSpec);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* SearchService;
        return yield* search.search({ query: "delete", limit: 2 });
      }).pipe(Effect.provide(layer))
    );
    expect(result.formattedText).toContain("run.projects.locations.services.delete");
  });
});
