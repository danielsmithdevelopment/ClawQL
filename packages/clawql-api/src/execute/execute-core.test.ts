import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ExecuteService } from "../execute-service.js";
import type { LoadedSpec } from "../spec/spec-loader.js";
import { executeClawqlOperation, executeClawqlOperationEffect } from "./execute-core.js";
import { makeExecuteLive } from "./execute-live.js";

const emptySpec = (): Promise<LoadedSpec> =>
  Promise.resolve({
    operations: [],
    rawSource: {},
    openapi: { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} },
    multi: false,
  });

describe("executeClawqlOperationEffect", () => {
  it("returns unknown operationId error as MCP text", async () => {
    const content = await Effect.runPromise(
      executeClawqlOperationEffect({ operationId: "missing.op", args: {} }, emptySpec)
    );
    expect(content).toHaveLength(1);
    const body = JSON.parse(content[0]!.text) as { error: string };
    expect(body.error).toContain('Unknown operationId: "missing.op"');
  });

  it("promise boundary matches Effect program output", async () => {
    const params = { operationId: "missing.op", args: {} };
    const fromEffect = await Effect.runPromise(executeClawqlOperationEffect(params, emptySpec));
    const fromPromise = await executeClawqlOperation(params, emptySpec);
    expect(fromPromise).toEqual(fromEffect);
  });
});

describe("makeExecuteLive", () => {
  it("wires ExecuteService to native Effect.gen pipeline", async () => {
    const layer = makeExecuteLive(emptySpec);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const execute = yield* ExecuteService;
        return yield* execute.execute({ operationId: "nope", args: {} });
      }).pipe(Effect.provide(layer))
    );
    expect(result.content[0]?.text).toContain("Unknown operationId");
  });
});
