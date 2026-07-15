import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  decodeExecuteInput,
  decodeSearchInput,
  ExecuteInputSchema,
  SearchInputSchema,
} from "./search-execute-schema.js";
import { Schema } from "effect";

describe("SearchInputSchema / ExecuteInputSchema", () => {
  it("applies search limit default via Effect Schema", async () => {
    const decoded = await Effect.runPromise(decodeSearchInput({ query: "list jobs" }));
    expect(decoded).toEqual({ query: "list jobs", limit: 5 });
  });

  it("rejects invalid search limit", async () => {
    await expect(Effect.runPromise(decodeSearchInput({ query: "x", limit: 0 }))).rejects.toThrow();
  });

  it("decodes execute args and optional fields", async () => {
    const decoded = await Effect.runPromise(
      decodeExecuteInput({
        operationId: "run.projects.locations.services.list",
        args: { parent: "projects/p" },
        fields: ["name"],
      })
    );
    expect(decoded.operationId).toBe("run.projects.locations.services.list");
    expect(decoded.args).toEqual({ parent: "projects/p" });
    expect(decoded.fields).toEqual(["name"]);
  });

  it("rejects execute without operationId", async () => {
    await expect(Effect.runPromise(decodeExecuteInput({ args: {} }))).rejects.toThrow(
      /operationId/i
    );
  });

  it("exposes Schema type identity for Typed APIs", () => {
    type S = Schema.Schema.Type<typeof SearchInputSchema>;
    type E = Schema.Schema.Type<typeof ExecuteInputSchema>;
    const s: S = { query: "q", limit: 5 };
    const e: E = { operationId: "op", args: {} };
    expect(s.limit).toBe(5);
    expect(e.args).toEqual({});
  });
});
