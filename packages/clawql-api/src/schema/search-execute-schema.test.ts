import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  decodeExecuteInput,
  decodeResumeInput,
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

  it("decodes optional where JMESPath", async () => {
    const decoded = await Effect.runPromise(
      decodeExecuteInput({
        operationId: "pulls/list",
        args: {},
        fields: ["number", "title"],
        where: "[?state=='open']",
      })
    );
    expect(decoded.where).toBe("[?state=='open']");
  });

  it("rejects where longer than 512 characters", async () => {
    await expect(
      Effect.runPromise(
        decodeExecuteInput({
          operationId: "pulls/list",
          args: {},
          where: "x".repeat(513),
        })
      )
    ).rejects.toThrow();
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

  it("rejects search without query", async () => {
    await expect(Effect.runPromise(decodeSearchInput({ limit: 3 }))).rejects.toThrow(/query/i);
  });

  it("does not coerce search limit from a string (Schema v4)", async () => {
    await expect(
      Effect.runPromise(decodeSearchInput({ query: "list jobs", limit: "5" }))
    ).rejects.toThrow();
  });

  it("strips unknown search keys (Schema v4 excess property handling)", async () => {
    const decoded = await Effect.runPromise(
      decodeSearchInput({ query: "list jobs", unexpected: true })
    );
    expect(decoded).toEqual({ query: "list jobs", limit: 5 });
    expect(decoded).not.toHaveProperty("unexpected");
  });

  it("never decodes host-only approvedExecutionId from execute arguments", async () => {
    const decoded = await Effect.runPromise(
      decodeExecuteInput({ operationId: "issues.create", args: {}, approvedExecutionId: "pex_1" })
    );
    expect(decoded).not.toHaveProperty("approvedExecutionId");
  });

  it("decodes resume with executionId only", async () => {
    const decoded = await Effect.runPromise(decodeResumeInput({ executionId: "pex_1" }));
    expect(decoded.executionId).toBe("pex_1");
  });

  it("rejects resume without executionId", async () => {
    await expect(Effect.runPromise(decodeResumeInput({ decision: "approve" }))).rejects.toThrow(
      /executionId/i
    );
  });
});
