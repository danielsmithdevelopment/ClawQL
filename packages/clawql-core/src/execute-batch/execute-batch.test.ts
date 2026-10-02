import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  createMemoryExecuteBatchRegistryLayer,
  ExecuteBatchRegistry,
  runNamedExecuteBatch,
  type ExecuteBatchScript,
} from "./index.js";
import { WormAuditSink } from "../plugin/provider-types.js";

function wormTestLayer() {
  const events: unknown[] = [];
  return {
    events,
    layer: Layer.succeed(
      WormAuditSink,
      WormAuditSink.of({
        append: (event) =>
          Effect.sync(() => {
            events.push(event);
          }),
      })
    ),
  };
}

describe("execute-batch registry + runner", () => {
  it("runs a registered batch and emits WORM start/complete", async () => {
    const script: ExecuteBatchScript = {
      name: "demo-batch",
      run: (args) =>
        Effect.succeed({
          terminal: { ok: true },
          batch: {
            batchId: "b1",
            batchName: "demo-batch",
            tenantId: args.tenantId,
            agentId: args.agentId,
            sessionId: args.sessionId,
            innerCallCount: 1,
            success: true,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          },
        }),
    };

    const worm = wormTestLayer();
    const layer = Layer.mergeAll(createMemoryExecuteBatchRegistryLayer([script]), worm.layer);

    const result = await Effect.runPromise(
      runNamedExecuteBatch({
        batchName: "demo-batch",
        args: { tenantId: "t", agentId: "a", sessionId: "s" },
      }).pipe(Effect.provide(layer))
    );

    expect(result.terminal).toEqual({ ok: true });
    expect(worm.events.map((e) => (e as { type: string }).type)).toEqual([
      "EXECUTE_BATCH_STARTED",
      "EXECUTE_BATCH_COMPLETED",
    ]);
  });

  it("fails when batch is not registered", async () => {
    const worm = wormTestLayer();
    const layer = Layer.mergeAll(createMemoryExecuteBatchRegistryLayer(), worm.layer);
    const either = await Effect.runPromise(
      Effect.either(
        runNamedExecuteBatch({
          batchName: "missing",
          args: { tenantId: "t", agentId: "a", sessionId: "s" },
        }).pipe(Effect.provide(layer))
      )
    );
    expect(either._tag).toBe("Left");
  });

  it("lists registered batch names", async () => {
    const layer = createMemoryExecuteBatchRegistryLayer([
      {
        name: "outbound-x402-pay",
        run: () => Effect.fail(new Error("not used")),
      },
    ]);
    const names = await Effect.runPromise(
      Effect.gen(function* () {
        const reg = yield* ExecuteBatchRegistry;
        return yield* reg.list();
      }).pipe(Effect.provide(layer))
    );
    expect(names).toEqual(["outbound-x402-pay"]);
  });
});
